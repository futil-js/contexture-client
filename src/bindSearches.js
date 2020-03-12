import _ from 'lodash/fp'
import F from 'futil-js'

let sourceKey = source => `tree-binding-source-${source.field}`
let targetKey = search =>
  `tree-binding-destination-${_.get('tree.schema', search)}`

let getSearchSourceNodes = _.flow(
  _.get('tree.children'),
  _.filter(_.has('targetSearches'))
)

export let bindSearches = ({
  searches = {}, // instantiated contexture-client searches
  subqueries = [], // [{ source: { search, field }, targets: [{ search, field }] }]
}) => {
  _.each(({ source, targets }) => {
    let sourceSearch = searches[source.search]
    let targetSchemas = _.map(
      target => _.get('tree.schema', searches[target.search]),
      targets
    )

    // add the subquery source node with bookkeeping arrays for which subqueries
    // exist (targetSearches) and which are currently inactive (suppressUpdates)
    sourceSearch.add(['root'], {
      key: sourceKey(source),
      type: 'facet',
      field: source.field,
      size: 1000000,
      isMongoId: true,
      paused: true,
      suppressUpdates: targetSchemas,
      targetSearches: targetSchemas,
      treeBindingSource: true,
    })

    let sourceNode = sourceSearch.getNode(['root', sourceKey(source)])

    // calcluate all source and target node paths on the tree for the whole bindSearches blob
    // now so that we won't have to lookup node.treeBindingSource in tree.mutate below
    // updates to these nodes will be ignored except in one cases handled below in node.afterSearch
    let sourceSearchMaintainSuppressionPaths = _.concat(
      _.flow(
        _.filter(subquery => subquery.source.search === source.search),
        _.map(subquery => ['root', sourceKey(subquery.source)])
      )(subqueries),
      _.flow(
        _.flatMap(subquery =>
          _.map(
            target => ({ ...target, sourceSearch: subquery.source.search }),
            subquery.targets
          )
        ),
        _.filter(target => target.search === source.search),
        _.map(target => ['root', targetKey(searches[target.sourceSearch])])
      )(subqueries)
    )

    // wrap the default tree.mutate so we can inspect all mutations and re-enable updates
    // other trees when the current tree receives updates from the user or other trees
    sourceSearch.defaultMutate =
      sourceSearch.defaultMutate || sourceSearch.mutate
    sourceSearch.mutate = (path, mutation) => {
      // if we get a real change to value, values or options on a non-ignored path, clear
      // update supporession to the neigboring trees
      if (
        F.cascade(['values', 'value', 'options'], mutation) &&
        !_.find(p => _.isEqual(p, path), sourceSearchMaintainSuppressionPaths)
      ) {
        let sourceSearchSourcePaths = _.flow(
          getSearchSourceNodes,
          _.map(node => ['root', node.key])
        )(sourceSearch)
        _.map(
          sourceSearchSourcePath =>
            sourceSearch.defaultMutate(sourceSearchSourcePath, {
              suppressUpdates: [],
              paused: false,
            }),
          sourceSearchSourcePaths
        )
      }
      // pass the mutation through to the original tree.mutate
      sourceSearch.defaultMutate(path, mutation)
    }

    // add a subquery target node for each target search specified in the blob
    // for the current source node
    let targetSearches = _.map(target => {
      let targetSearch = searches[target.search]
      targetSearch.add(['root'], {
        key: targetKey(sourceSearch),
        type: 'facet',
        field: target.field,
        size: 1000000,
        isMongoId: true,
      })
      return targetSearch
    }, targets)

    sourceNode.afterSearch = () => {
      // when we get search results on a source node, first remove anything on its suppressUpdates list
      // from its total list of subquery targets
      let targetSearchesToUpdate = _.reject(
        targetSearch =>
          _.includes(targetSearch.tree.schema, sourceNode.suppressUpdates),
        targetSearches
      )

      _.each(targetSearch => {
        // now, for each target tree that we're going to pass values to, we need to tell it to ignore
        // subsequent updates from the current source tree (until this suppression is cleared by the wrapped tree.mutate)
        _.each(
          targetSearchSourceNode =>
            targetSearch.mutate(['root', targetSearchSourceNode.key], {
              suppressUpdates: _.includes(
                sourceSearch.tree.schema,
                _.get('targetSearches', targetSearchSourceNode)
              )
                ? [sourceSearch.tree.schema]
                : [],
              paused: false,
            }),
          getSearchSourceNodes(targetSearch)
        )

        // set source option names as the target facet values or cleae the target as appropriate
        let foreignTargetPath = ['root', targetKey(sourceSearch)]
        if (sourceSearch.tree.hasValue) {
          targetSearch.mutate(foreignTargetPath, {
            values: _.map('name', sourceNode.context.options),
          })
        } else {
          targetSearch.clear(foreignTargetPath)
        }
      }, targetSearchesToUpdate)
    }
  }, subqueries)
}
