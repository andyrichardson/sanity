import React from 'react'
import ArrayFunctions from 'part:@sanity/form-builder/input/array/functions'
import {map} from 'rxjs/operators'
import {isPlainObject, get} from 'lodash'
import {FOCUS_TERMINATOR, startsWith} from '@sanity/util/paths'
import Button from 'part:@sanity/components/buttons/default'
import Fieldset from 'part:@sanity/components/fieldsets/default'
import formBuilderConfig from 'config:@sanity/form-builder'
import DefaultButton from 'part:@sanity/components/buttons/default'
import {ResolvedUploader, Uploader} from '../../sanity/uploads/typedefs'
import {Marker, Type} from '../../typedefs'
import {Path} from '../../typedefs/path'
import {Subscription} from '../../typedefs/observable'
import {resolveTypeName} from '../../utils/resolveTypeName'
import UploadTargetFieldset from '../../utils/UploadTargetFieldset'
import {insert, PatchEvent, set, setIfMissing, unset} from '../../PatchEvent'
import Details from '../common/Details'
import Warning from '../Warning'
import resolveListComponents from './resolveListComponents'
import {ArrayType, ItemValue} from './typedefs'
import RenderItemValue from './ItemValue'
import randomKey from './randomKey'

import styles from './styles/ArrayInput.css'

const NO_MARKERS: Marker[] = []
const SUPPORT_DIRECT_UPLOADS = get(formBuilderConfig, 'images.directUploads')

function createProtoValue(type: Type): ItemValue {
  if (type.jsonType !== 'object') {
    throw new Error(
      `Invalid item type: "${type.type}". Default array input can only contain objects (for now)`
    )
  }
  const key = randomKey(12)
  return type.name === 'object'
    ? {_key: key}
    : {
        _type: type.name,
        _key: key
      }
}

export type Props = {
  type: ArrayType
  value: Array<ItemValue>
  markers: Array<Marker>
  level: number
  onChange: (event: PatchEvent) => void
  onFocus: (path: Path) => void
  onBlur: () => void
  focusPath: Path
  readOnly: boolean
  filterField: (field: any) => boolean
  resolveUploader?: (type: Type, file: File) => Uploader
  presence: any
}
type ArrayInputState = {
  isMoving: boolean
}
export default class ArrayInput extends React.Component<Props, ArrayInputState> {
  _element: any
  uploadSubscriptions: {
    [name: string]: Subscription
  } = {}
  static defaultProps = {
    focusPath: []
  }
  state = {
    isMoving: false
  }
  insert = (itemValue: ItemValue, position: 'before' | 'after', atIndex: number) => {
    const {onChange} = this.props
    onChange(PatchEvent.from(setIfMissing([]), insert([itemValue], position, [atIndex])))
  }
  handlePrepend = (value: ItemValue) => {
    this.insert(value, 'before', 0)
    this.handleFocusItem(value)
  }
  handleAppend = (value: ItemValue) => {
    this.insert(value, 'after', -1)
    this.handleFocusItem(value)
  }
  handleRemoveItem = (item: ItemValue) => {
    this.removeItem(item)
  }
  handleFocus = () => {
    this.props.onFocus([FOCUS_TERMINATOR])
  }
  handleFocusItem = (item: ItemValue) => {
    this.props.onFocus([{_key: item._key}, FOCUS_TERMINATOR])
  }

  removeItem(item: ItemValue) {
    const {onChange, onFocus, value} = this.props
    onChange(PatchEvent.from(unset(item._key ? [{_key: item._key}] : [value.indexOf(item)])))
    if (item._key in this.uploadSubscriptions) {
      this.uploadSubscriptions[item._key].unsubscribe()
    }
    const idx = value.indexOf(item)
    const nextItem = value[idx + 1] || value[idx - 1]
    onFocus([nextItem ? {_key: nextItem._key} : FOCUS_TERMINATOR])
  }

  handleItemChange = (event: PatchEvent, item: ItemValue) => {
    const {onChange, value} = this.props
    const memberType = this.getMemberTypeOfItem(item)
    if (!memberType) {
      // eslint-disable-next-line no-console
      console.log('Could not find member type of item ', item)
      return
    }
    if (memberType.readOnly) {
      return
    }
    const key = item._key || randomKey(12)
    onChange(
      event.prefixAll({_key: key}).prepend(item._key ? [] : set(key, [value.indexOf(item), '_key']))
    )
  }
  handleSortStart = () => {
    this.setState({isMoving: true})
  }
  handleSortEnd = (event: {newIndex: number; oldIndex: number}) => {
    this.setState({isMoving: false})
    const {value, onChange} = this.props
    const item = value[event.oldIndex]
    const refItem = value[event.newIndex]
    // console.log('from %d => %d', event.oldIndex, event.newIndex, event)
    if (!item._key || !refItem._key) {
      // eslint-disable-next-line no-console
      console.error(
        'Neither the item you are moving nor the item you are moving to have a key. Cannot continue.'
      )
      return
    }
    if (event.oldIndex === event.newIndex || item._key === refItem._key) {
      return
    }
    onChange(
      PatchEvent.from(
        unset([{_key: item._key}]),
        insert([item], event.oldIndex > event.newIndex ? 'before' : 'after', [{_key: refItem._key}])
      )
    )
  }

  getMemberTypeOfItem(item: ItemValue): Type {
    const {type} = this.props
    const itemTypeName = resolveTypeName(item)
    return type.of.find(memberType => memberType.name === itemTypeName)
  }

  renderList = () => {
    const {
      type,
      markers,
      readOnly,
      value,
      focusPath,
      onBlur,
      onFocus,
      level,
      filterField,
      presence
    } = this.props
    const {isMoving} = this.state
    const options = type.options || {}
    const hasMissingKeys = value.some(item => !item._key)
    const isSortable = options.sortable !== false && !hasMissingKeys
    const isGrid = options.layout === 'grid'
    const {List, Item} = resolveListComponents(isSortable, isGrid)
    const listProps = isSortable
      ? {
          movingItemClass: styles.movingItem,
          onSortEnd: this.handleSortEnd,
          onSortStart: this.handleSortStart,
          lockToContainerEdges: true,
          useDragHandle: !isGrid
        }
      : {}
    const listItemClassName = isMoving ? styles.listItemMute : styles.listItem
    return (
      <List className={readOnly ? styles.listReadOnly : styles.list} {...listProps}>
        {value.map((item, index) => {
          const isChildMarker = marker =>
            startsWith([index], marker.path) || startsWith([{_key: item && item._key}], marker.path)
          const childMarkers = markers.filter(isChildMarker)
          const isChildPresence = pItem =>
            startsWith([index], pItem.path) || startsWith([{_key: item && item._key}], pItem.path)
          const childPresence = isGrid ? [] : presence.filter(isChildPresence)
          const itemProps = isSortable ? {index} : {}
          return (
            <Item
              key={item._key}
              className={isGrid ? styles.gridItem : listItemClassName}
              {...itemProps}
            >
              <RenderItemValue
                type={type}
                value={item}
                level={level}
                markers={childMarkers.length === 0 ? NO_MARKERS : childMarkers}
                onRemove={this.handleRemoveItem}
                onChange={this.handleItemChange}
                focusPath={focusPath}
                filterField={filterField}
                onFocus={onFocus}
                onBlur={onBlur}
                readOnly={readOnly || hasMissingKeys}
                presence={childPresence}
              />
            </Item>
          )
        })}
      </List>
    )
  }

  focus() {
    if (this._element) {
      this._element.focus()
    }
  }

  setElement = el => {
    this._element = el
  }
  getUploadOptions = (file: File): Array<ResolvedUploader> => {
    const {type, resolveUploader} = this.props
    if (!resolveUploader) {
      return []
    }
    return type.of
      .map(memberType => {
        const uploader = resolveUploader(memberType, file)
        return (
          uploader && {
            type: memberType,
            uploader
          }
        )
      })
      .filter(Boolean)
  }
  handleFixMissingKeys = () => {
    const {onChange, value} = this.props
    const patches = value.map((val, i) => setIfMissing(randomKey(), [i, '_key']))
    onChange(PatchEvent.from(...patches))
  }
  handleRemoveNonObjectValues = () => {
    const {onChange, value} = this.props
    const nonObjects = value
      .reduce((acc, val, i) => (isPlainObject(val) ? acc : acc.concat(i)), [])
      .reverse()
    const patches = nonObjects.map(index => unset([index]))
    onChange(PatchEvent.from(...patches))
  }
  handleUpload = ({file, type, uploader}) => {
    const {onChange} = this.props
    const item = createProtoValue(type)
    const key = item._key
    this.insert(item, 'after', -1)
    const events$ = uploader
      .upload(file, type)
      .pipe(map((uploadEvent: any) => PatchEvent.from(uploadEvent.patches).prefixAll({_key: key})))
    this.uploadSubscriptions = {
      ...this.uploadSubscriptions,
      [key]: events$.subscribe(onChange)
    }
  }
  renderUnknownValueTypes = () => {
    const {value, type, readOnly} = this.props
    const knownTypes = (type.of || []).map(t => t.name).filter(typeName => typeName !== 'object')
    const unknownValues = (value || []).filter(v => v._type && !knownTypes.includes(v._type))
    if (!unknownValues || unknownValues.length < 1) {
      return null
    }
    const message = (
      <>
        These are not defined in the current schema as valid types for this array. This could mean
        that the type has been removed, or that someone else has added it to their own local schema
        that is not yet deployed.
        {unknownValues.map(item => {
          return (
            <div key={item._type}>
              <h4>{item._type}</h4>
              <pre className={styles.inspectValue}>{JSON.stringify(item, null, 2)}</pre>
              {readOnly ? (
                <div>
                  This array is <em>read only</em> according to its enclosing schema type and values
                  cannot be unset. If you want to unset a value, make sure you remove the{' '}
                  <strong>readOnly</strong> property from the enclosing type.
                </div>
              ) : (
                <DefaultButton onClick={() => this.handleRemoveItem(item)} color="danger">
                  Unset {item._type}
                </DefaultButton>
              )}
            </div>
          )
        })}
      </>
    )
    return (
      <div className={styles.unknownValueTypes}>
        <Warning message={message} values={unknownValues} />
      </div>
    )
  }

  render() {
    const {type, level, markers, readOnly, onChange, value, presence} = this.props
    const hasNonObjectValues = (value || []).some(item => !isPlainObject(item))
    if (hasNonObjectValues) {
      return (
        <Fieldset
          legend={type.title}
          description={type.description}
          level={level}
          tabIndex={0}
          onFocus={this.handleFocus}
          ref={this.setElement}
          markers={markers}
        >
          <div className={styles.nonObjectsWarning}>
            Some items in this list are not objects. We need to remove them before the list can be
            edited.
            <div className={styles.removeNonObjectsButtonWrapper}>
              <Button onClick={this.handleRemoveNonObjectValues}>Remove non-object values</Button>
            </div>
            <Details title={<b>Why is this happening?</b>}>
              This usually happens when items are created through an API client from outside the
              Content Studio and sets invalid data, or a custom input component have inserted
              incorrect values into the list.
            </Details>
          </div>
        </Fieldset>
      )
    }
    const hasMissingKeys = (value || []).some(item => !item._key)
    if (hasMissingKeys) {
      return (
        <Fieldset
          legend={type.title}
          description={type.description}
          level={level}
          tabIndex={0}
          onFocus={this.handleFocus}
          ref={this.setElement}
          markers={markers}
        >
          <div className={styles.missingKeysWarning}>
            Some items in this list are missing their keys. We need to fix this before the list can
            be edited.
            <div className={styles.fixMissingKeysButtonWrapper}>
              <Button onClick={this.handleFixMissingKeys}>Fix missing keys</Button>
            </div>
            <Details title={<b>Why is this happening?</b>}>
              This usually happens when items are created through the API client from outside the
              Content Studio and someone forgets to set the <code>_key</code>-property of list
              items.
              <p>
                The value of the <code>_key</code> can be any <b>string</b> as long as it is{' '}
                <b>unique</b> for each element within the array.
              </p>
            </Details>
          </div>
          {this.renderList()}
        </Fieldset>
      )
    }
    const FieldSetComponent = SUPPORT_DIRECT_UPLOADS ? UploadTargetFieldset : Fieldset
    const uploadProps = SUPPORT_DIRECT_UPLOADS
      ? {getUploadOptions: this.getUploadOptions, onUpload: this.handleUpload}
      : {}
    return (
      <FieldSetComponent
        markers={markers}
        tabIndex={0}
        legend={type.title}
        description={type.description}
        level={level}
        className={styles.root}
        onFocus={this.handleFocus}
        type={type}
        ref={this.setElement}
        presence={presence.filter(item => item.path[0] === '$')}
        {...uploadProps}
      >
        <div>
          {value && value.length > 0 && this.renderList()}
          {this.renderUnknownValueTypes()}
          <ArrayFunctions
            type={type}
            value={value}
            readOnly={readOnly}
            onAppendItem={this.handleAppend}
            onPrependItem={this.handlePrepend}
            onFocusItem={this.handleFocusItem}
            onCreateValue={createProtoValue}
            onChange={onChange}
          />
        </div>
      </FieldSetComponent>
    )
  }
}
