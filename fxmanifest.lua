fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'mz_radialmenu'
author 'Mazus / MZ Framework'
description 'Menu radial contextual independente do MZ Framework'
version '1.0.0'

ui_page 'web/index.html'

shared_scripts {
  '@ox_lib/init.lua',
  'shared/config.lua'
}

client_scripts {
  'client/main.lua'
}

files {
  'web/index.html',
  'web/style.css',
  'web/script.js',
  'web/lucide.min.js',
  'locales/*.json'
}

dependency 'ox_lib'
