import _ from 'lodash/fp'
import { pullOn } from 'futil-js'
import { encode } from './util/tree'

// Note:
// When an action receives a path, it might not be a clean JavaScript array,
// for example: in Mobx, in many cases the search tree is an Observable object
// that includes paths that really have a type of Observable Array. These changed
// types aren't perfect and since we don't have a way to forbid users from sending them,
// we should at least try to clean them.

export default ({
  getNode,
  flat,
  dispatch,
  snapshot,
  types,
  extend,
  initNode,
}) => ({
  async add(parentPath, node) {
    let cleanParentPath = snapshot(parentPath)
    let target = getNode(cleanParentPath)
    let path = [...cleanParentPath, node.key]
    // TODO: Does not currently call init on child nodes
    initNode(node, path, extend, types)
    target.children.push(node)
    // Need this nonsense to support the case where push actually mutates, e.g. a mobx observable tree
    flat[encode(path)] = target.children[target.children.length - 1]
    return dispatch({ type: 'add', path, node })
  },
  async remove(path) {
    let cleanPath = snapshot(path)
    let previous = getNode(cleanPath)
    let parent = getNode(_.dropRight(1, cleanPath))
    pullOn(previous, parent.children)
    delete flat[encode(cleanPath)]
    return dispatch({ type: 'remove', cleanPath, previous })
  },
  mutate: _.curry(async (path, value) => {
    let cleanPath = snapshot(path)
    let target = getNode(cleanPath)
    let previous = snapshot(_.omit('children', target))
    extend(target, value)
    return dispatch({
      type: 'mutate',
      path: cleanPath,
      previous,
      value,
      node: target,
    })
  }),
  refresh: path => dispatch({ type: 'refresh', path: snapshot(path) }),
  triggerUpdate: () => dispatch({ type: 'none', path: [], autoUpdate: true }),
})
