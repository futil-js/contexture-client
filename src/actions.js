import _ from 'lodash/fp'
import * as F from 'futil-js'
import {mapAsync} from './util/promise'

export default ({getNode, flat, dispatch}) => ({
  add: async (path, value) => {
    let target = getNode(path)
    value.path = target.path + '->' + value.key
    target.children.push(value)
    flat[value.path] = value
    return dispatch({ type: 'add', path: value.path.split('->'), value })
  },
  remove: async path => {
    let target = getNode(path)
    let parent = getNode(_.dropRight(1, path))
    _.update('children', _.without(target), parent)
    delete flat[target.path]
    return dispatch({ type: 'remove', path, previous: target })
  },
  mutate: async (path, value) => {
    let target = getNode(path)
    let previous = _.cloneDeep(_.omit('children', target))
    F.extendOn(target, value)
    await mapAsync(async (value, type) =>
      dispatch({ type, path, value, previous })
    , value)
    return dispatch({
      type: 'mutate',
      path,
      previous,
      value,
      node: target,
      dontProcess: true
    })
  }
})