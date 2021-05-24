import path from 'path'
import { Plugin, ResolvedConfig } from 'vite'
import { createFilter } from '@rollup/pluginutils'
import { camelize, capitalize } from '@vue/shared'

import { isBuiltInComponent } from '@dcloudio/uni-shared'
import {
  EXTNAME_VUE,
  H5_COMPONENTS_STYLE_PATH,
  BASE_COMPONENTS_STYLE_PATH,
  COMPONENT_DEPS_CSS,
  parseVueRequest,
} from '@dcloudio/uni-cli-shared'

import { UniPluginFilterOptions } from '.'
import { debugEasycom, matchEasycom } from '../../utils'
import { buildInCssSet, isCombineBuiltInCss } from './css'

const H5_COMPONENTS_PATH = '@dcloudio/uni-h5'

const baseComponents = [
  'audio',
  'button',
  'canvas',
  'checkbox',
  'checkbox-group',
  'editor',
  'form',
  'icon',
  'image',
  'input',
  'label',
  'movable-area',
  'movable-view',
  'navigator',
  'picker-view',
  'picker-view-column',
  'progress',
  'radio',
  'radio-group',
  'resize-sensor',
  'rich-text',
  'scroll-view',
  'slider',
  'swiper',
  'swiper-item',
  'switch',
  'text',
  'textarea',
  'view',
]

const identifierRE = /^([a-zA-Z_$][a-zA-Z\\d_$]*)$/

export function uniEasycomPlugin(
  options: UniPluginFilterOptions,
  config: ResolvedConfig
): Plugin {
  const filter = createFilter(options.include, options.exclude)
  const needCombineBuiltInCss = isCombineBuiltInCss(config)
  return {
    name: 'vite:uni-easycom',
    transform(code, id) {
      if (!filter(id)) {
        return
      }
      const { filename, query } = parseVueRequest(id)
      if (
        query.type !== 'template' &&
        (query.vue || !EXTNAME_VUE.includes(path.extname(filename)))
      ) {
        return
      }
      debugEasycom(id)
      let i = 0
      const importDeclarations: string[] = []
      code = code.replace(
        /_resolveComponent\("(.+?)"(, true)?\)/g,
        (str, name) => {
          if (name && !name.startsWith('_')) {
            if (isBuiltInComponent(name)) {
              const local = `__syscom_${i++}`
              if (needCombineBuiltInCss) {
                // 发行模式下，应该将内置组件css输出到入口css中
                resolveBuiltInCssImport(name).forEach((cssImport) =>
                  buildInCssSet.add(cssImport)
                )
                return addImportDeclaration(
                  importDeclarations,
                  local,
                  H5_COMPONENTS_PATH,
                  capitalize(camelize(name))
                )
              }
              return addBuiltInImportDeclaration(
                importDeclarations,
                local,
                name
              )
            }
            const source = matchEasycom(name)
            if (source) {
              return (
                // 解决局部引入组件优先级(理论上让开发者使用script setup就可以解决局部引入)
                (identifierRE.test(name)
                  ? `typeof ${name} !== 'undefined' ? ${name} : `
                  : '') +
                addImportDeclaration(
                  importDeclarations,
                  `__easycom_${i++}`,
                  source
                )
              )
            }
          }
          return str
        }
      )
      if (importDeclarations.length) {
        code = importDeclarations.join('') + code
      }
      return code
    },
  }
}

function resolveBuiltInCssImport(name: string) {
  const cssImports: string[] = []
  if (baseComponents.includes(name)) {
    cssImports.push(BASE_COMPONENTS_STYLE_PATH + name + '.css')
  } else {
    cssImports.push(H5_COMPONENTS_STYLE_PATH + name + '.css')
  }
  const deps = COMPONENT_DEPS_CSS[name as keyof typeof COMPONENT_DEPS_CSS]
  deps && deps.forEach((dep) => cssImports.push(dep))
  return cssImports
}

function addBuiltInImportDeclaration(
  importDeclarations: string[],
  local: string,
  name: string
) {
  resolveBuiltInCssImport(name).forEach((cssImport) =>
    importDeclarations.push(`import '${cssImport}';`)
  )
  return addImportDeclaration(
    importDeclarations,
    local,
    H5_COMPONENTS_PATH,
    capitalize(camelize(name))
  )
}

function addImportDeclaration(
  importDeclarations: string[],
  local: string,
  source: string,
  imported?: string
) {
  importDeclarations.push(createImportDeclaration(local, source, imported))
  return local
}

function createImportDeclaration(
  local: string,
  source: string,
  imported?: string
) {
  if (imported) {
    return `import {${imported} as ${local}} from '${source}';`
  }
  return `import ${local} from '${source}';`
}
