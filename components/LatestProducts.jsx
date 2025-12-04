'use client'

import { useDispatch, useSelector } from 'react-redux'
import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FaStar } from 'react-icons/fa'
import { ShoppingCartIcon } from 'lucide-react'

import { addToCart, uploadCart } from '@/lib/features/cart/cartSlice'
import { fetchProducts } from '@/lib/features/product/productSlice'
import { useAuth } from '@/lib/useAuth'

import toast from 'react-hot-toast'
import Title from './Title'

// Helper to get product image
const getImageSrc = (product, index = 0) => {
  if (product.images && Array.isArray(product.images) && product.images.length > index) {
    if (product.images[index]?.url) return product.images[index].url
    if (product.images[index]?.src) return product.images[index].src
    if (typeof product.images[index] === 'string') return product.images[index]
  }
  return 'https://ik.imagekit.io/jrstupuke/placeholder.png'
}

// Product Card Component
const ProductCard = ({ product }) => {
  const [hovered, setHovered] = useState(false)
  const dispatch = useDispatch()
  const { getToken } = useAuth()
  const cartItems = useSelector(state => state.cart.cartItems)
  const itemQuantity = cartItems[product.id] || 0

  const primaryImage = getImageSrc(product, 0)
  const secondaryImage = getImageSrc(product, 1)
  
  const hasSecondary = secondaryImage !== 'https://ik.imagekit.io/jrstupuke/placeholder.png' && 
                       secondaryImage !== primaryImage &&
                       product.images?.length > 1
  
  const discount =
    product.mrp && product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : 0

  const ratingValue = Math.round(product.averageRating || 0)
  const reviewCount = product.ratingCount || 0

  const productName = (product.name || product.title || 'Untitled Product').length > 30
    ? (product.name || product.title || 'Untitled Product').slice(0, 30) + '...'
    : (product.name || product.title || 'Untitled Product')

  const handleAddToCart = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dispatch(addToCart({ productId: product._id }))
    dispatch(uploadCart({ getToken }))
    toast.success('Added to cart')
  }

  return (
    <Link
      href={`/product/${product.slug || product.id || ''}`}
      className={`group bg-white rounded-xl shadow-sm ${hasSecondary ? 'hover:shadow-lg' : ''} transition-all duration-300 flex flex-col relative overflow-hidden`}
      onMouseEnter={hasSecondary ? () => setHovered(true) : null}
      onMouseLeave={hasSecondary ? () => setHovered(false) : null}
    >
      {/* Image Container */}
      <div className="relative w-full h-32 sm:h-56 overflow-hidden bg-gray-50">
        {product.fastDelivery && (
          <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] sm:text-[8px] lg:text-[12px] font-bold px-1.5 py-1 sm:px-1 sm:py-0.5 lg:px-2 lg:py-1.5 rounded-full shadow-md z-10">
            Fast Delivery
          </span>
        )}
        <Image
          src={primaryImage}
          alt={productName}
          fill
          style={{ objectFit: 'cover' }}
          className={`w-full h-full object-cover ${hasSecondary ? 'transition-opacity duration-500' : ''} ${
            hasSecondary && hovered ? 'opacity-0' : 'opacity-100'
          }`}
          sizes="(max-width: 768px) 100vw, (max-width: 1300px) 50vw, 25vw"
          priority
          onError={(e) => { e.currentTarget.src = 'https://ik.imagekit.io/jrstupuke/placeholder.png' }}
        />

        {hasSecondary && (
          <Image
            src={secondaryImage}
            alt={productName}
            fill
            style={{ objectFit: 'cover' }}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
              hovered ? 'opacity-100' : 'opacity-0'
            }`}
            sizes="(max-width: 768px) 100vw, (max-width: 1300px) 50vw, 25vw"
            priority
            onError={(e) => { e.currentTarget.src = 'https://ik.imagekit.io/jrstupuke/placeholder.png' }}
          />
        )}
        
        {discount > 0 && (
          <span className={`absolute top-2 right-2 ${discount >= 50 ? 'bg-green-500' : 'bg-orange-500'} text-white text-[10px] sm:text-[8px] lg:text-[12px] font-bold px-1.5 py-1 sm:px-1 sm:py-0.5 lg:px-2 lg:py-1.5 rounded-full shadow-md z-10`}>
            {discount}% OFF
          </span>
        )}
      </div>

      {/* Product Info */}
      <div className="p-2 flex flex-col flex-grow">
        <h3 className="text-xs sm:text-sm font-medium text-gray-800 line-clamp-2 mb-1">
          {productName}
        </h3>
        
        <div className="flex items-center mb-2">
          {reviewCount > 0 ? (
            <>
              {[...Array(5)].map((_, i) => (
                <FaStar
                  key={i}
                  size={10}
                  className={i < ratingValue ? 'text-yellow-400' : 'text-gray-300'}
                />
              ))}
              <span className="text-gray-500 text-[5px] sm:text-xs ml-1">({reviewCount})</span>
            </>
          ) : (
            <span className="text-[5px] sm:text-xs text-gray-400">No reviews yet</span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            {Number(product.price) > 0 && (
              <p className="text-sm sm:text-base font-bold text-black">
                ₹{Number(product.price).toFixed(2)}
              </p>
            )}
            {Number(product.mrp) > 0 && Number(product.mrp) > Number(product.price) && (
              <p className="text-xs sm:text-sm text-gray-400 line-through">
                ₹{Number(product.mrp).toFixed(2)}
              </p>
            )}
          </div>
          
          <button 
            onClick={handleAddToCart}
            className='w-8 h-8 sm:w-10 sm:h-10 bg-slate-700 hover:bg-slate-900 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 relative'
          >
            <ShoppingCartIcon className='text-white' size={16} />
            {itemQuantity > 0 && (
              <span className='absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shadow-md'>
                {itemQuantity}
              </span>
            )}
          </button>
        </div>
      </div>
    </Link>
  )
}

// BestSelling Component
const BestSelling = () => {
  const displayQuantity = 10
  const products = useSelector((state) => state.product.list || [])
  const dispatch = useDispatch()

  useEffect(() => {
    if (products.length === 0) {
      dispatch(fetchProducts({ limit: displayQuantity }))
    }
  }, [products.length, dispatch])

  const baseSorted = useMemo(() =>
    products
      .slice()
      .sort((a, b) => (b.rating?.length || b.ratingCount || 0) - (a.rating?.length || a.ratingCount || 0))
      .slice(0, displayQuantity)
  , [products, displayQuantity])

  const isLoading = products.length === 0

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto">
      <Title
        title="Craziest sale of the year!"
        description="Grab the best deals before they're gone!"
        visibleButton={false}
      />

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
        {isLoading
          ? Array(displayQuantity).fill(0).map((_, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm animate-pulse">
                <div className="w-full h-32 sm:h-56 bg-gray-200 rounded-t-xl" />
                <div className="p-2">
                  <div className="h-4 bg-gray-200 rounded mb-2" />
                  <div className="flex items-center gap-1 mb-3">
                    {Array(5).fill(0).map((_, i) => (
                      <div key={i} className="h-3 w-3 bg-gray-200 rounded" />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-16 bg-gray-200 rounded" />
                    <div className="h-8 w-8 sm:h-10 sm:w-10 bg-gray-200 rounded-full" />
                  </div>
                </div>
              </div>
            ))
          : baseSorted.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
      </div>
    </div>
  )
}

export default BestSelling
