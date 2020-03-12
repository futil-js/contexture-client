import _ from 'lodash/fp'
import F from 'futil-js'

let sourceKey = source => `tree-binding-source-${source.field}`
let targetKey = search => `tree-binding-destination-${_.get('tree.schema', search)}`

let getSearchSourceNodes = _.flow(
  _.get('tree.children'),
  _.filter(_.has('targetSearches')),
)

export let bindSearches = ({
  searches = {},
  subqueries = []
}) => {
  _.each(({ source, targets }) => {
    let sourceSearch = searches[source.search]
    let targetSchemas = _.map(target => _.get('tree.schema', searches[target.search]), targets)

    sourceSearch.add(['root'], {
      key: sourceKey(source),
      type: 'facet',
      field: source.field,
      size: 1000000,
      isMongoId: true,
      paused: true,
      suppressUpdates: targetSchemas,
      targetSearches: targetSchemas
    })

    let sourceNode = sourceSearch.getNode(['root', sourceKey(source)])

    let sourceSearchMaintainSuppressionPaths = _.concat(
      _.flow(
        _.filter(subquery => subquery.source.search === source.search),
        _.map(subquery => ['root', sourceKey(subquery.source)])
      )(subqueries),
      _.flow(
        _.flatMap(subquery => _.map(target => ({...target, sourceSearch: subquery.source.search }), subquery.targets)),
        _.filter(target => target.search === source.search),
        _.map(target => ['root', targetKey(searches[target.sourceSearch])])
      )(subqueries),
    )

    sourceSearch.defaultMutate = sourceSearch.defaultMutate || sourceSearch.mutate
    sourceSearch.mutate = (path, mutation) => {
      if (F.cascade(['values', 'value', 'options'], mutation) && !_.find(p => _.isEqual(p, path), sourceSearchMaintainSuppressionPaths)) {
        let sourceSearchSourcePaths = _.flow(
          getSearchSourceNodes,
          _.map(node => ['root', node.key])
        )(sourceSearch)
        _.map(sourceSearchSourcePath => sourceSearch.defaultMutate(sourceSearchSourcePath, { suppressUpdates: [], paused: false }), sourceSearchSourcePaths)
      }
      sourceSearch.defaultMutate(path, mutation)
    }

    let targetSearches = _.map(target => {
      let targetSearch = searches[target.search]
      targetSearch.add(['root'], {
        key: targetKey(sourceSearch),
        type: 'facet',
        field: target.field,
        size: 1000000,
        isMongoId: true
      })
      return targetSearch
    }, targets)

    sourceNode.afterSearch = () => {
      let targetSearchesToUpdate = _.reject(targetSearch => _.includes(targetSearch.tree.schema, sourceNode.suppressUpdates), targetSearches)

      _.each(targetSearch => {
        _.each(targetSearchSourceNode => targetSearch.mutate(['root', targetSearchSourceNode.key], {
          suppressUpdates: _.includes(sourceSearch.tree.schema, _.get('targetSearches', targetSearchSourceNode)) ? [sourceSearch.tree.schema] : [],
          paused: false
        }), getSearchSourceNodes(targetSearch))

        let foreignTargetPath = ['root', targetKey(sourceSearch)]
        if (sourceSearch.tree.hasValue) {
          targetSearch.mutate(foreignTargetPath, { values: _.map('name', sourceNode.context.options) })
        } else {
          targetSearch.clear(foreignTargetPath)
        }
      }, targetSearchesToUpdate)
    }
  }, subqueries)
}
