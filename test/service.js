import * as F from 'futil-js'
import chai from 'chai'
import sinonChai from 'sinon-chai'
import * as lib from '../src'
import Promise from 'bluebird'
const expect = chai.expect
chai.use(sinonChai)

describe('services', () => {
  it('should not throw if the service is too busy to answer', async () => {
    let tree = {
      key: 'root',
      join: 'and',
      children: [
        {
          key: 'filter',
        },
        {
          key: 'results',
          type: 'results',
        },
      ],
    }
    let service = F.aspects.command()(async () => {
      await Promise.delay(10)
      return { data: {} }
    })
    let Tree = lib.ContextTree({ service }, tree)
    let errors = []
    for (let i = 0; i < 10; i++) {
      Tree.mutate(['root', 'filter'], {
        data: {
          values: ['a'],
        },
      }).catch(F.pushOn(errors))
      await Promise.delay(1)
    }
    expect(errors).to.be.empty
  })
})
