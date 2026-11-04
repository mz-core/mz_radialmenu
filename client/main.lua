MZRadial = MZRadial or {}

if lib and type(lib.locale) == 'function' then lib.locale() end
local activeLocale = GetConvar('ox:locale', '')
local configuredLocale = activeLocale ~= ''

local options, ownerHandles = {}, {}
local sequence = 0
local isOpen = false
local openContext
local visibleOptions = {}

local function text(key, fallback)
  if configuredLocale and type(locale) == 'function' then
    local ok, value = pcall(locale, key)
    if ok and type(value) == 'string' and value ~= key then return value end
  end
  return fallback
end

local function trim(value)
  return tostring(value or ''):gsub('^%s+', ''):gsub('%s+$', '')
end

local function debugPrint(message)
  if MZRadialConfig.debug == true then print(('[mz_radialmenu] %s'):format(message)) end
end


local function normalizeCallback(callback)
  if type(callback) == 'function' then
    return callback
  end

  if type(callback) ~= 'table' then
    return nil
  end

  local ref = rawget(callback, '__cfx_functionReference')
  local mt = getmetatable(callback)

  if type(ref) ~= 'string'
      or ref == ''
      or type(mt) ~= 'table'
      or type(rawget(mt, '__call')) ~= 'function' then
    return nil
  end

  return function(...)
    return callback(...)
  end
end



local function normalize(data, owner, parent)
  if type(data) ~= 'table' then return nil, 'invalid_option' end
  local publicId, label = trim(data.id), trim(data.label)
  if publicId == '' or not publicId:match('^[%w%._:%-]+$') then return nil, 'invalid_id' end
  if label == '' then return nil, 'invalid_label' end

  local canOpen = normalizeCallback(data.canOpen)
  local onSelect = normalizeCallback(data.onSelect)
  if data.canOpen ~= nil and not canOpen then return nil, 'invalid_can_open' end
  if data.onSelect ~= nil and not onSelect then return nil, 'invalid_on_select' end

  local id = parent and (parent.id .. '/' .. publicId) or (owner .. ':' .. publicId)
  local option = {
    id = id,
    public_id = publicId,
    owner = owner,
    label = label,
    description = trim(data.description),
    icon = trim(data.icon),
    disabled = data.disabled == true,
    canOpen = canOpen,
    onSelect = onSelect,
    parent = parent,
    children = {}
  }

  local childIds = {}
  for _, child in ipairs(type(data.children) == 'table' and data.children or {}) do
    local childId = type(child) == 'table' and trim(child.id) or ''
    if childId == '' or childIds[childId] then
      return nil, childId == '' and 'invalid_child_id' or 'duplicate_child_id'
    end
    childIds[childId] = true
    local normalized, err = normalize(child, owner, option)
    if not normalized then return nil, err end
    option.children[#option.children + 1] = normalized
  end



  if #option.children == 0 and not option.onSelect then
    print(('[MZ MENU] missing_action | owner=%s | id=%s | label=%s | onSelect=%s | children=%d'):format(
      tostring(owner),
      tostring(id),
      tostring(label),
      type(data.onSelect),
      #option.children
    ))

    return nil, 'missing_action'
  end

  return option
end

local function remove(handle, owner)
  local option = options[trim(handle)]
  if not option or (owner and option.owner ~= owner) then return false end
  option.removed = true
  options[option.id] = nil
  local handles = ownerHandles[option.owner]
  if handles then
    handles[option.id] = nil
    if next(handles) == nil then ownerHandles[option.owner] = nil end
  end
  return true
end

local function removeOwner(owner)
  local handles = ownerHandles[owner]
  if not handles then return 0 end
  local pending = {}
  for handle in pairs(handles) do pending[#pending + 1] = handle end
  local count = 0
  for _, handle in ipairs(pending) do if remove(handle, owner) then count = count + 1 end end
  return count
end

function MZRadial.RegisterOption(data, owner)
  owner = trim(owner)
  if owner == '' then owner = GetCurrentResourceName() end
  local option, err = normalize(data, owner)
  if not option then return false, err end
  remove(option.id, owner)
  sequence = sequence + 1
  option.order = sequence
  options[option.id] = option
  ownerHandles[owner] = ownerHandles[owner] or {}
  ownerHandles[owner][option.id] = true
  return true, option.id
end

function MZRadial.RemoveOption(handle, owner)
  owner = trim(owner)
  if owner == '' then owner = GetCurrentResourceName() end
  return remove(handle, owner)
end

function MZRadial.GetOption(handle, owner)
  owner = trim(owner)
  if owner == '' then owner = GetCurrentResourceName() end
  local option = options[trim(handle)]
  if not option or option.owner ~= owner then return nil end
  return { handle = option.id, id = option.public_id, owner = option.owner, children = #option.children }
end

local function context()
  local ped = PlayerPedId()
  local vehicle = ped and ped ~= 0 and GetVehiclePedIsIn(ped, false) or 0
  return {
    ped = ped,
    coords = ped and ped ~= 0 and GetEntityCoords(ped) or nil,
    vehicle = vehicle ~= 0 and vehicle or nil,
    in_vehicle = vehicle ~= 0
  }
end

local function allowed(option, currentContext)
  if type(option.canOpen) ~= 'function' then return true end
  local ok, result = pcall(option.canOpen, currentContext)
  if not ok then
    debugPrint(('canOpen failed owner=%s id=%s'):format(option.owner, option.id))
    return false
  end
  return result == true
end

local function allowedChain(option, currentContext)
  local current = option
  while current do
    if not allowed(current, currentContext) then return false end
    current = current.parent
  end
  return true
end

local function prepare(option, currentContext, lookup, root)
  if not allowed(option, currentContext) then return nil end
  root = root or option
  local children = {}
  for _, child in ipairs(option.children) do
    local prepared = prepare(child, currentContext, lookup, root)
    if prepared then children[#children + 1] = prepared end
  end
  if #option.children > 0 and #children == 0 then return nil end
  -- Guarda a raiz para revalidar selecoes depois de restart/remocao do provider.
  lookup[option.id] = { option = option, root = root }
  return {
    id = option.id,
    label = option.label,
    description = option.description,
    icon = option.icon,
    disabled = option.disabled,
    children = children
  }
end

function MZRadial.Open()
  if isOpen or IsPauseMenuActive() or IsNuiFocused() then return false end
  local currentContext = context()
  local roots = {}
  for _, option in pairs(options) do roots[#roots + 1] = option end
  table.sort(roots, function(left, right) return left.order < right.order end)

  local prepared, lookup = {}, {}
  local maximum = math.max(1, tonumber(MZRadialConfig.maximum_items) or 12)
  for _, option in ipairs(roots) do
    local item = prepare(option, currentContext, lookup)
    if item and #prepared < maximum then prepared[#prepared + 1] = item end
  end
  if #prepared == 0 then return false end

  local payload = {
    action = 'open',
    locale = configuredLocale and activeLocale or 'pt-BR',
    menu = { title = text('title', 'Ações rápidas'), options = prepared },
    labels = {
      hint = text('hint', 'Selecione uma ação'),
      back = text('back', 'Voltar'),
      close = text('close', 'Fechar')
    }
  }

  local focusOk = pcall(function()
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(false)
  end)
  if not focusOk then
    return false
  end
  pcall(SetCursorLocation, 0.5, 0.5)

  openContext, visibleOptions, isOpen = currentContext, lookup, true
  local sentOk = pcall(SendNUIMessage, payload)
  if not sentOk then
    isOpen, openContext, visibleOptions = false, nil, {}
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    debugPrint('nui_open_failed')
    return false
  end

  return true
end

function MZRadial.Close()
  if not isOpen then return false end
  isOpen, openContext, visibleOptions = false, nil, {}
  SetNuiFocus(false, false)
  SetNuiFocusKeepInput(false)
  SendNUIMessage({ action = 'close' })
  return true
end

function MZRadial.IsOpen()
  return isOpen
end

RegisterNUICallback('close', function(_, cb)
  MZRadial.Close()
  cb({ ok = true })
end)

RegisterNUICallback('select', function(data, cb)
  local key = trim(type(data) == 'table' and data.option_id or '')
  local entry = key ~= '' and visibleOptions[key] or nil
  local option = entry and entry.option or nil

  if not option or option.disabled or #option.children > 0 then
    cb({ ok = false, error = 'invalid_option' })
    return
  end

  if not entry.root
      or entry.root.removed == true
      or options[entry.root.id] ~= entry.root
      or not allowedChain(option, openContext) then
    MZRadial.Close()
    cb({ ok = false, error = 'stale_option' })
    return
  end

  local action, currentContext = option.onSelect, openContext
  if type(action) ~= 'function' then
    cb({ ok = false, error = 'invalid_option' })
    return
  end

  MZRadial.Close()
  local ok, result = pcall(action, currentContext)
  cb({ ok = ok and result ~= false, error = ok and nil or 'action_failed' })
end)

RegisterCommand('+' .. MZRadialConfig.command, function() MZRadial.Open() end, false)
RegisterCommand('-' .. MZRadialConfig.command, function() end, false)
RegisterKeyMapping('+' .. MZRadialConfig.command, text('key_mapping', 'Abrir menu radial'), 'keyboard',
  MZRadialConfig.key)

exports('RegisterOption', function(data) return MZRadial.RegisterOption(data, GetInvokingResource()) end)
exports('RemoveOption', function(handle) return MZRadial.RemoveOption(handle, GetInvokingResource()) end)
exports('GetOption', function(handle) return MZRadial.GetOption(handle, GetInvokingResource()) end)
exports('Open', MZRadial.Open)
exports('Close', MZRadial.Close)
exports('IsOpen', MZRadial.IsOpen)

AddEventHandler('onClientResourceStop', function(resourceName)
  if resourceName == GetCurrentResourceName() then
    if isOpen then MZRadial.Close() end
    return
  end
  local removed = removeOwner(resourceName)
  if isOpen and removed > 0 then MZRadial.Close() end
end)

CreateThread(function()
  Wait(0)
  TriggerEvent('mz_radialmenu:client:ready')
end)
