import React from 'react'
import ImageIcon from 'part:@sanity/base/image-icon'
import client from 'part:@sanity/base/client'
import Button from 'part:@sanity/components/buttons/default'
import FullscreenDialog from 'part:@sanity/components/dialogs/fullscreen'
import Asset from './Asset'
import {AssetFromSource} from './ImageInput'

import styles from './DefaultSource.css'

const PER_PAGE = 200

interface AssetType {
  _id: string
  url: string
}

interface Props {
  onSelect: (arg0: AssetFromSource[]) => void
  onClose: () => void
  selectedAssets: AssetType[]
  selectionType: boolean
}

const buildQuery = (start = 0, end = PER_PAGE) => `
  *[_type == "sanity.imageAsset"] | order(_updatedAt desc) [${start}...${end}] {
    _id,
    url,
    metadata {dimensions}
  }
`

type State = {
  assets: Array<AssetType>
  isLastPage: boolean
  isLoading: boolean
}

class DefaultSource extends React.Component<Props, State> {
  state = {
    assets: [],
    isLastPage: false,
    isLoading: false
  }

  pageNo = 0

  fetchPage(pageNo: number) {
    const start = pageNo * PER_PAGE
    const end = start + PER_PAGE

    this.setState({isLoading: true})

    return client.fetch(buildQuery(start, end)).then(result => {
      this.setState(prevState => ({
        isLastPage: result.length < PER_PAGE,
        assets: prevState.assets.concat(result),
        isLoading: false
      }))
    })
  }

  handleDeleteFinished = id => {
    this.setState(prevState => ({
      assets: prevState.assets.filter(asset => asset._id !== id)
    }))
  }

  componentDidMount() {
    this.fetchPage(this.pageNo)
  }

  select(id) {
    const selected = this.state.assets.find(doc => doc._id === id)

    if (selected) {
      this.props.onSelect([{kind: 'assetDocumentId', value: id}])
    }
  }

  handleItemClick = (event: React.MouseEvent) => {
    event.preventDefault()

    this.select(event.currentTarget.getAttribute('data-id'))
  }

  handleItemKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.select(event.currentTarget.getAttribute('data-id'))
    }
  }

  handleClose = () => {
    if (this.props.onClose) {
      this.props.onClose()
    }
  }

  handleFetchNextPage = () => {
    this.fetchPage(++this.pageNo)
  }

  render() {
    const {selectedAssets} = this.props
    const {assets, isLastPage, isLoading} = this.state

    return (
      <FullscreenDialog
        cardClassName={styles.card}
        title="Select image"
        onClose={this.handleClose}
        isOpen
      >
        <div className={styles.imageGrid}>
          {assets.map(asset => (
            <Asset
              key={asset._id}
              asset={asset}
              isSelected={selectedAssets.some(selected => selected._id === asset._id)}
              onClick={this.handleItemClick}
              onKeyPress={this.handleItemKeyPress}
              onDeleteFinished={this.handleDeleteFinished}
            />
          ))}
        </div>

        {!isLoading && assets.length === 0 && (
          <div className={styles.noAssets}>No images found</div>
        )}

        <div className={styles.loadMore}>
          {!isLastPage && (
            <Button inverted onClick={this.handleFetchNextPage} loading={isLoading}>
              Load more
            </Button>
          )}
        </div>
      </FullscreenDialog>
    )
  }
}

export default {
  name: 'sanity-default',
  title: 'Uploaded images',
  component: DefaultSource,
  icon: ImageIcon
}
