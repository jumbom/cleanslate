import { css } from '@emotion/react'
import React from 'react'
import { getDispatch } from '../../../helpers/getDispatch'
import {
  type ProductHit,
  searchProducts,
} from '../../../helpers/openFoodFacts/searchProducts'
import { colors } from '../../../theme'
import { Spinner } from '../../spinner/Spinner'

type props = { searchText: string }

type Status = 'idle' | 'loading' | 'done' | 'error'

const styles = css`
  border-top: 1px solid ${colors.lightgrey};
  padding: 10px 20px 20px;
  .search-products {
    border: 1px dashed ${colors.mediumgrey};
    color: ${colors.text};
    font-size: 0.9rem;
    justify-content: flex-start;
    padding: 12px 15px;
    text-align: left;
    width: 100%;
  }
  .heading {
    color: ${colors.darkgrey};
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.05rem;
    margin: 10px 0 5px;
    text-transform: uppercase;
  }
  .hit {
    align-items: flex-start;
    border-bottom: 1px solid ${colors.lightgrey};
    flex-direction: column;
    font-size: 0.95rem;
    padding: 12px 0;
    text-align: left;
    width: 100%;
    .meta {
      color: ${colors.darkgrey};
      font-size: 0.8rem;
      margin-top: 2px;
    }
  }
  .message {
    color: ${colors.darkgrey};
    font-size: 0.85rem;
    line-height: 1.5;
    margin-top: 10px;
  }
`

/**
 * Searches supermarket products (Albert Heijn, Lidl, ...) in Open Food Facts.
 * Runs only when tapped: the public service limits how often it can be called.
 */
export const ProductSearch: React.FC<props> = ({ searchText }) => {
  const dispatch = getDispatch()
  const [status, setStatus] = React.useState<Status>('idle')
  const [hits, setHits] = React.useState<ProductHit[]>([])
  const [searchedFor, setSearchedFor] = React.useState('')

  const query = searchText.trim()

  // A new search text resets the previous product results
  React.useEffect(() => {
    if (query !== searchedFor) {
      setStatus('idle')
      setHits([])
    }
  }, [query, searchedFor])

  if (query.length < 2) return null

  const run = async () => {
    setStatus('loading')
    setSearchedFor(query)
    try {
      setHits(await searchProducts(query))
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  const choose = (hit: ProductHit) => {
    dispatch('closeModal')
    dispatch('openBarcodeModalWithCode', hit.code)
  }

  return (
    <div css={styles}>
      {status === 'idle' && (
        <button type="button" className="search-products" onClick={run}>
          🛒 Search shop products for “{query}”
        </button>
      )}

      {status === 'loading' && (
        <div className="fcc" style={{ padding: 15 }}>
          <Spinner color={colors.purple} />
        </div>
      )}

      {status === 'error' && (
        <div className="message">
          Couldn't reach Open Food Facts right now.{' '}
          <button type="button" className="empty" onClick={run}>
            Try again
          </button>
        </div>
      )}

      {status === 'done' && hits.length === 0 && (
        <div className="message">
          No products found for “{searchedFor}”. Try the brand or a shorter name
          (e.g. “skyr” or “AH kwark”), or scan the barcode.
        </div>
      )}

      {status === 'done' && hits.length > 0 && (
        <>
          <div className="heading">Shop products · Open Food Facts</div>
          {hits.map((hit) => (
            <button
              type="button"
              className="hit fcs"
              key={hit.code}
              onClick={() => choose(hit)}
            >
              <span>{hit.name}</span>
              <span className="meta">
                {[hit.brand, hit.quantity].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
