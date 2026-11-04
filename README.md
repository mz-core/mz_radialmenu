# mz_radialmenu

Menu radial NUI independente. Não usa raycast, cache de entidade ou estado do `mz_target`.

A interface é uma roda circular com setores SVG reais, área central para voltar/fechar, ícones locais (Lucide) e destaque no setor ativo. Mouse, setas, Enter/Espaço, Backspace e `ESC` funcionam sem cards orbitais. Até 12 opções raiz são exibidas; submenus navegam em níveis.

## Start e locale

```cfg
setr ox:locale en # opcional: use inglês (en-US); sem convar, o fallback é pt-BR
ensure ox_lib
ensure mz_radialmenu
```

`F` é o padrão e pode ser remapeado nas configurações de teclas do FiveM.

## API cliente

```lua
local ok, handle = exports['mz_radialmenu']:RegisterOption({
  id = 'my_actions',
  label = 'Minhas ações',
  icon = 'star',
  canOpen = function(context) return not context.in_vehicle end,
  children = {
    {
      id = 'wave',
      label = 'Acenar',
      icon = 'hand',
      onSelect = function(context) return true end
    }
  }
})

exports['mz_radialmenu']:RemoveOption(handle)
exports['mz_radialmenu']:GetOption(handle)
exports['mz_radialmenu']:Open()
exports['mz_radialmenu']:Close()
exports['mz_radialmenu']:IsOpen()
```

IDs são namespaced pelo resource chamador e registros repetidos substituem o anterior. Registros são removidos quando o provider para. Providers devem re-registrar ao receber `mz_radialmenu:client:ready` ou quando o resource radial iniciar.

`canOpen` controla somente visibilidade. Ações sensíveis continuam obrigadas a validar autoridade no servidor.

Callbacks aceitam funções locais e referências Cfx entre resources. `canOpen`/`onSelect` inválidos são rejeitados no registro; opções `disabled`, opções removidas durante a abertura e providers que param fecham a seleção sem executar ação. O foco NUI é liberado no fechamento, no `onClientResourceStop` e em falhas de seleção.
