/* eslint-disable no-nested-ternary */

import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import useSWR from 'swr'
import _ from 'lodash'
import { DefaultButton, Stack, SpinButton } from '@fluentui/react'

import { runCommand } from '@/utils/fetcher'
import { parse } from '@/utils/mongo-shell-data'
import { Table } from '@/components/Table'
import { FilterInput } from '@/components/FilterInput'
import { DocumentTable } from '@/components/DocumentTable'
import { actions } from '@/stores'
import { Pagination } from '@/components/Pagination'
import { LargeMessage } from '@/components/LargeMessage'

enum Type {
  CURRENT = 'Current Op',
  PROFILE = 'System Profile',
}

const examples: { [key: string]: object } = {
  'Slow operations': {
    active: true,
    microsecs_running: { $gte: 100 * 1000 },
  },
  'Queries not using any index': {
    op: 'query',
    planSummary: 'COLLSCAN',
  },
  'Write operations': {
    $or: [
      { op: { $in: ['insert', 'update', 'remove'] } },
      { 'command.findandmodify': { $exists: true } },
    ],
  },
  'Waiting for a Lock': {
    waitingForLock: true,
  },
  'Operations with no yields': {
    numYields: 0,
    waitingForLock: false,
  },
  'Operations with high yields num': {
    numYields: { $gte: 100 },
  },
  'Indexing operations': {
    $or: [
      { op: 'command', 'command.createIndexes': { $exists: true } },
      { op: 'none', msg: parse('/^Index Build/') },
    ],
  },
}

export default () => {
  const { database, collection } = useSelector((state) => state.root)
  const [filter, setFilter] = useState<object>({})
  const [example, setExample] = useState<string>()
  const [type, setType] = useState(Type.CURRENT)
  const { data, error, isValidating } = useSWR(
    type === Type.CURRENT
      ? `currentOp/${database}/${collection}/${JSON.stringify(filter)}`
      : null,
    () =>
      runCommand<{ inprog: any[] }>('admin', {
        currentOp: 1,
        ...filter,
        ns: database && collection ? `${database}.${collection}` : undefined,
      }),
    { refreshInterval: 1000 },
  )
  const dispatch = useDispatch()
  useEffect(() => {
    if (type === Type.PROFILE) {
      dispatch(actions.root.setCollection('system.profile'))
    }
  }, [type])
  useEffect(() => {
    setType(collection === 'system.profile' ? Type.PROFILE : Type.CURRENT)
  }, [collection])
  const { data: profile } = useSWR(
    type === Type.PROFILE && database ? `profile/${database}` : null,
    () =>
      runCommand<{ was: number; slowms: number; sampleRate: number }>(
        database!,
        { profile: -1 },
      ),
  )
  const [was, setWas] = useState(0)
  const [slowms, setSlowms] = useState('')
  const [sampleRate, setSampleRate] = useState('')
  useEffect(() => {
    if (!profile) {
      return
    }
    setWas(profile.was)
    setSlowms(profile.slowms.toString())
    setSampleRate(profile.sampleRate.toString())
  }, [profile])

  return (
    <>
      <Stack
        wrap={true}
        horizontal={true}
        tokens={{ childrenGap: 10, padding: 10 }}
        styles={{
          root: {
            marginBottom: -10,
            justifyContent: 'space-between',
          },
        }}>
        {_.map(Type, (v, k: Type) => (
          <DefaultButton
            key={k}
            text={v}
            primary={type === v}
            onClick={() => {
              setType(v)
            }}
          />
        ))}
        <Stack.Item grow={true}>
          <div />
        </Stack.Item>
        {type === Type.PROFILE ? <Pagination allowInsert={false} /> : null}
      </Stack>
      {type === Type.CURRENT ? (
        <>
          <Stack
            wrap={true}
            horizontal={true}
            tokens={{ childrenGap: 10, padding: 10 }}
            styles={{ root: { marginBottom: -10 } }}>
            {_.map(examples, (_v, k) => (
              <DefaultButton
                key={k}
                text={k}
                primary={example === k}
                onClick={() => {
                  setExample(example === k ? undefined : k)
                  setFilter(example === k || !k ? {} : examples[k])
                }}
              />
            ))}
          </Stack>
          <Stack
            horizontal={true}
            tokens={{ childrenGap: 10, padding: 10 }}
            styles={{ root: { height: 52 } }}>
            <FilterInput
              autoFocus={true}
              value={filter}
              onChange={(value) => {
                setExample(undefined)
                setFilter(value as {})
              }}
            />
          </Stack>
          <Table
            items={data?.inprog}
            error={error}
            isValidating={isValidating}
            order={[
              'host',
              'ns',
              'op',
              'client',
              'command',
              'desc',
              'microsecs_running',
            ]}
          />
        </>
      ) : null}
      {type === Type.PROFILE ? (
        database ? (
          <>
            <Stack
              horizontal={true}
              tokens={{ childrenGap: 10, padding: 10 }}
              styles={{ root: { height: 52 } }}>
              <SpinButton
                label="Slow Ms:"
                min={0}
                max={100}
                step={1}
                value={slowms}
                onIncrement={setSlowms}
                onDecrement={setSlowms}
              />
              <SpinButton
                label="Sample Rate:"
                min={0}
                max={1}
                step={0.1}
                value={sampleRate}
                onIncrement={setSampleRate}
                onDecrement={setSampleRate}
              />
            </Stack>
            <DocumentTable
              order={['ns', 'op', 'client', 'command', 'millis']}
            />
          </>
        ) : (
          <LargeMessage iconName="Back" title="Select database" />
        )
      ) : null}
    </>
  )
}
