import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import ProductCard from './components/ProductCard'
import CtaBanner from './components/CtaBanner'
import { useCtaBanners } from '@/context/CtaBannersContext'
import Skeleton from '@/components/ui/Skeleton'
import { useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { getOptimizedImage } from '@/utils/imageOptimizer'

const CATEGORIES = ['All', 'Watches', 'Necklaces', 'Earrings', 'Rings', 'Bracelets', 'Collections']

const ProductsPage = () => {
  const { activeBanners } = useCtaBanners()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchParams] = useSearchParams()
  const searchField = searchParams.get('search')

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('products')
        .select('*')
        .order('display_order', { ascending: false })
        .order('created_at', { ascending: false })

      // Server-side category filtering (M-7: eliminates transferring full dataset)
      if (activeCategory !== 'All') {
        query = query.ilike('category', activeCategory)
      }

      const { data, error: dbError } = await query
      if (dbError) throw dbError
      setProducts(data || [])
    } catch (err) {
      console.error('Products fetch error:', err)
      setError('Unable to load collection. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [activeCategory])

  useEffect(() => {
    fetchProducts()

    // Realtime stock synchronization for the collection list
    const channel = supabase
      .channel('public:products:collection')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, (payload) => {
        setProducts(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchProducts])

  // Client-side search filter applied on top of server-side category data
  const filteredProducts = searchField
    ? products.filter(p => {
        const term = searchField.toLowerCase()
        return (
          p.name?.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term) ||
          p.category?.toLowerCase().includes(term)
        )
      })
    : products

  return (
    <div className="bg-white min-h-screen pt-24 lg:pt-32 pb-20 lg:pb-32">
      <Helmet>
        <title>{activeCategory === 'All' ? 'Shop Full Collection' : `Buy ${activeCategory}`} | Lustrax Jewelries Nigeria</title>
        <meta name="description" content={`Explore our exclusive collection of ${activeCategory.toLowerCase()} at Lustrax. Premium handcrafted luxury jewelry delivered across Nigeria.`} />
        <link rel="canonical" href={`https://lustrax-jewelries.com/${activeCategory !== 'All' ? `?category=${activeCategory}` : ''}`} />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://lustrax-jewelries.com/"
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "Collection",
                "item": "https://lustrax-jewelries.com/"
              }
            ]
          })}
        </script>
      </Helmet>

      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        
        {/* Editorial Collection Header */}
        <div className="mb-16 lg:mb-20">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
            <span className="text-subheading text-gold block">
              Online Shop
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold text-charcoal tracking-tight">
              {activeCategory === 'All' ? 'All Products' : activeCategory}
            </h1>
            <div className="w-12 h-[1px] bg-gold mx-auto my-4" />
            <p className="text-body text-gray-500 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
              Explore our chains, necklaces, rings, and bracelets. Made with high quality materials for everyday wear.
            </p>
          </div>
          
          {/* Architectural Filter Bar */}
          <div className="border-y border-neutral-border py-3">
             <div className="flex items-center justify-start md:justify-end overflow-x-auto filter-scrollbar gap-2 sm:gap-2.5 py-1 px-1 scroll-smooth">
               {CATEGORIES.map(cat => (
                 <button
                   key={cat}
                   onClick={() => setActiveCategory(cat)}
                   className={`flex-shrink-0 whitespace-nowrap py-1.5 px-3.5 sm:px-4 rounded-full text-[9px] sm:text-[10px] font-normal uppercase tracking-[0.18em] border transition-luxury ${
                     activeCategory === cat 
                       ? 'bg-obsidian text-gold border-obsidian shadow-premium-sm' 
                       : 'bg-white text-gray-500 border-neutral-border hover:border-charcoal hover:text-charcoal'
                   }`}
                 >
                   {cat === 'Collections' ? 'Collections' : cat}
                 </button>
               ))}
             </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="py-24 text-center space-y-6">
            <p className="text-subheading text-red-400 italic">{error}</p>
            <button
              onClick={fetchProducts}
              className="text-[10px] font-bold uppercase tracking-[0.3em] text-gold border border-gold px-8 py-3.5 hover:bg-gold hover:text-obsidian transition-luxury"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Loading State */}
        {!error && loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12 gap-x-6 lg:gap-x-8">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="aspect-[4/5]" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        )}

        {/* Animated Product Grid with CTA Banners in between */}
        {!error && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-y-7 sm:gap-y-9 lg:gap-y-11 gap-x-3 sm:gap-x-4 lg:gap-x-6 items-stretch">
            {filteredProducts.map((product, index) => {
              // Find if any active banner is scheduled right after this index (1-based index)
              const productPosition = index + 1
              const matchingBanner = activeBanners.find(
                b => Number(b.insert_after_index) === productPosition
              )

              return (
                <React.Fragment key={product.id}>
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col h-full"
                  >
                    <ProductCard product={product} />
                  </motion.div>

                  {/* Render CTA Banner across full width grid when reached */}
                  {matchingBanner && (
                    <CtaBanner banner={matchingBanner} />
                  )}
                </React.Fragment>
              )
            })}
            
            {filteredProducts.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full py-28 text-center space-y-4"
              >
                <span className="text-subheading text-gold block">No Items Found</span>
                <p className="text-body text-gray-400">There are no products matching your search right now.</p>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProductsPage
