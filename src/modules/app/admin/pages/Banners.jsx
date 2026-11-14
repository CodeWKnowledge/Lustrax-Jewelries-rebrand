import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCtaBanners, DEFAULT_CTA_BANNERS } from '@/context/CtaBannersContext'
import Button from '@/components/ui/Button'
import { 
  PlusSignIcon, 
  Delete02Icon, 
  Edit01Icon, 
  CheckmarkCircle01Icon, 
  AlertSquareIcon,
  SparklesIcon,
  ViewIcon,
  ArrowRight01Icon,
  ImageAdd02Icon
} from 'hugeicons-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'react-hot-toast'
import CtaBanner from '@/modules/marketing/products/components/CtaBanner'

const AdminBannersPage = () => {
  const { banners, saveBanners, resetToDefaults } = useCtaBanners()
  const [bannerList, setBannerList] = useState(banners)
  const [editingBanner, setEditingBanner] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  useEffect(() => {
    setBannerList(banners)
  }, [banners])

  const handleToggleActive = async (id) => {
    const updated = bannerList.map(b => b.id === id ? { ...b, active: !b.active } : b)
    setBannerList(updated)
    const res = await saveBanners(updated)
    toast.success('Banner visibility updated')
  }

  const handleDelete = async (id) => {
    if (bannerList.length <= 1) {
      toast.error('You should keep at least one banner configured.')
      return
    }
    const updated = bannerList.filter(b => b.id !== id)
    setBannerList(updated)
    await saveBanners(updated)
    toast.success('Banner removed')
  }

  const handleOpenAdd = () => {
    setEditingBanner({
      id: `banner-${Date.now()}`,
      headline: '',
      subheading: '',
      button_text: 'Explore Now',
      button_link: '/',
      is_external: false,
      tag: 'Special Notice',
      theme: 'dark',
      background_image: '',
      active: true,
      insert_after_index: 12
    })
    setIsModalOpen(true)
  }

  const handleOpenEdit = (banner) => {
    setEditingBanner({ ...banner })
    setIsModalOpen(true)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `banner-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`
      const filePath = `banners/${fileName}`

      // Attempt upload to Supabase storage 'products' bucket (which is already configured)
      const { error: uploadError } = await supabase.storage.from('products').upload(filePath, file)
      
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(filePath)
        setEditingBanner(prev => ({ ...prev, background_image: publicUrl }))
        toast.success('Background image uploaded')
      } else {
        // Fallback: create base64 / data URL so it works seamlessly even if storage has issues
        const reader = new FileReader()
        reader.onload = (event) => {
          setEditingBanner(prev => ({ ...prev, background_image: event.target.result }))
          toast.success('Background image attached')
        }
        reader.readAsDataURL(file)
      }
    } catch (err) {
      // Fallback to FileReader
      const reader = new FileReader()
      reader.onload = (event) => {
        setEditingBanner(prev => ({ ...prev, background_image: event.target.result }))
        toast.success('Background image attached')
      }
      reader.readAsDataURL(file)
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSaveModal = async (e) => {
    e.preventDefault()
    if (!editingBanner.headline.trim()) {
      toast.error('Please enter a headline')
      return
    }

    setSaving(true)
    const exists = bannerList.some(b => b.id === editingBanner.id)
    const updated = exists 
      ? bannerList.map(b => b.id === editingBanner.id ? editingBanner : b)
      : [...bannerList, editingBanner]

    // Sort by insert_after_index
    updated.sort((a, b) => (Number(a.insert_after_index) || 0) - (Number(b.insert_after_index) || 0))

    setBannerList(updated)
    await saveBanners(updated)
    setSaving(false)
    setIsModalOpen(false)
    toast.success('Banner saved successfully')
  }

  const handleResetDefaults = async () => {
    if (window.confirm('Reset all CTA banners to initial curated defaults?')) {
      await resetToDefaults()
      toast.success('Reset to defaults')
    }
  }

  return (
    <div className="space-y-10 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-border pb-6">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-[0.3em] text-gold">Storefront Marketing</span>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-charcoal">CTA Banners</h1>
          <p className="text-sm text-gray-500 font-light mt-1">
            Manage call-to-action banners placed in between products on the main catalog page.
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-4 py-2.5 text-[9px] uppercase font-bold tracking-widest text-gray-400 hover:text-charcoal border border-neutral-border transition-luxury"
          >
            Reset Defaults
          </button>
          <Button
            onClick={handleOpenAdd}
            variant="gold"
            className="!px-5 !py-2.5 !text-[10px] tracking-widest"
          >
            <PlusSignIcon size={14} className="mr-2" />
            New Banner
          </Button>
        </div>
      </div>

      {/* Banner Cards List */}
      <div className="space-y-6">
        {bannerList.map((banner, index) => (
          <div 
            key={banner.id}
            className="bg-white border border-neutral-border p-6 space-y-4 shadow-premium-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-border/60 pb-4">
              <div className="flex items-center space-x-3">
                <span className="w-6 h-6 bg-stone flex items-center justify-center text-[10px] font-bold text-charcoal border border-neutral-border">
                  #{index + 1}
                </span>
                <div>
                  <h3 className="text-base font-bold text-charcoal">{banner.headline || 'Untitled Banner'}</h3>
                  <p className="text-xs text-gray-400 font-light">
                    Displays after product #{banner.insert_after_index} • Theme: <span className="uppercase text-gold font-bold">{banner.theme}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleToggleActive(banner.id)}
                  className={`px-3 py-1.5 text-[9px] uppercase font-bold tracking-wider border transition-luxury ${
                    banner.active 
                      ? 'bg-green-50 text-green-700 border-green-200' 
                      : 'bg-stone text-gray-400 border-neutral-border'
                  }`}
                >
                  {banner.active ? 'Active' : 'Disabled'}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(banner)}
                  className="p-2 text-gray-400 hover:text-charcoal border border-neutral-border transition-luxury"
                  title="Edit Banner"
                >
                  <Edit01Icon size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(banner.id)}
                  className="p-2 text-gray-400 hover:text-red-500 border border-neutral-border transition-luxury"
                  title="Delete Banner"
                >
                  <Delete02Icon size={14} />
                </button>
              </div>
            </div>

            {/* Live Visual Preview */}
            <div className="pt-2">
              <p className="text-[9px] uppercase font-bold tracking-widest text-gray-400 mb-2">Live Storefront Preview</p>
              <CtaBanner banner={banner} />
            </div>
          </div>
        ))}
      </div>

      {/* Modal for Add / Edit */}
      <AnimatePresence>
        {isModalOpen && editingBanner && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="relative w-full max-w-2xl bg-white border border-neutral-border shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-xl font-display font-bold text-charcoal uppercase tracking-tight mb-6">
                {editingBanner.headline ? 'Edit CTA Banner' : 'Create New CTA Banner'}
              </h2>

              <form onSubmit={handleSaveModal} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Headline</label>
                  <input
                    type="text"
                    required
                    value={editingBanner.headline}
                    onChange={e => setEditingBanner({ ...editingBanner, headline: e.target.value })}
                    placeholder="e.g. LOOKING FOR SOMETHING SPECIAL?"
                    className="w-full bg-stone border border-neutral-border py-2.5 px-3.5 text-xs text-charcoal font-bold outline-none focus:border-charcoal"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Subheading / Description</label>
                  <textarea
                    rows={3}
                    value={editingBanner.subheading}
                    onChange={e => setEditingBanner({ ...editingBanner, subheading: e.target.value })}
                    placeholder="Short, helpful explanation for customers..."
                    className="w-full bg-stone border border-neutral-border py-2.5 px-3.5 text-xs text-charcoal outline-none focus:border-charcoal"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Tag / Badge Text</label>
                    <input
                      type="text"
                      value={editingBanner.tag || ''}
                      onChange={e => setEditingBanner({ ...editingBanner, tag: e.target.value })}
                      placeholder="e.g. Quick Support"
                      className="w-full bg-stone border border-neutral-border py-2.5 px-3.5 text-xs text-charcoal outline-none focus:border-charcoal"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Theme Style</label>
                    <select
                      value={editingBanner.theme}
                      onChange={e => setEditingBanner({ ...editingBanner, theme: e.target.value })}
                      className="w-full bg-stone border border-neutral-border py-2.5 px-3.5 text-xs text-charcoal outline-none focus:border-charcoal"
                    >
                      <option value="gold">Gold & Obsidian</option>
                      <option value="dark">Pure Obsidian Dark</option>
                      <option value="minimal">Minimal Light Stone</option>
                    </select>
                  </div>
                </div>

                {/* Background Image Attachment */}
                <div className="space-y-3 bg-stone/40 border border-neutral-border p-4 rounded-[4px]">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] uppercase font-bold tracking-widest text-charcoal flex items-center space-x-2">
                      <ImageAdd02Icon size={14} className="text-gold" />
                      <span>Background Picture (Optional)</span>
                    </label>
                    {editingBanner.background_image && (
                      <button
                        type="button"
                        onClick={() => setEditingBanner({ ...editingBanner, background_image: '' })}
                        className="text-[8px] uppercase tracking-wider text-red-500 hover:underline"
                      >
                        Remove Picture
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <label className="cursor-pointer inline-flex items-center space-x-2 px-4 py-2 border border-neutral-border bg-white hover:border-gold transition-luxury text-[9px] font-bold uppercase tracking-wider text-charcoal rounded-[3px]">
                      <span>{uploadingImage ? 'Uploading...' : 'Choose Image File'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingImage}
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>

                    <span className="text-[8px] text-gray-400 uppercase tracking-widest">or paste URL:</span>

                    <input
                      type="text"
                      value={editingBanner.background_image || ''}
                      onChange={e => setEditingBanner({ ...editingBanner, background_image: e.target.value })}
                      placeholder="https://... or uploaded image"
                      className="flex-1 bg-white border border-neutral-border py-1.5 px-3 text-xs text-charcoal outline-none focus:border-charcoal rounded-[2px]"
                    />
                  </div>

                  {editingBanner.background_image && (
                    <div className="relative h-20 w-full overflow-hidden border border-neutral-border rounded-[3px] bg-stone mt-2">
                      <img 
                        src={editingBanner.background_image} 
                        alt="Preview" 
                        className="w-full h-full object-cover object-center"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-[8px] uppercase tracking-widest font-bold text-white bg-black/60 px-2 py-1 rounded-[2px]">
                          Background Attached
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Button Text</label>
                    <input
                      type="text"
                      required
                      value={editingBanner.button_text}
                      onChange={e => setEditingBanner({ ...editingBanner, button_text: e.target.value })}
                      placeholder="e.g. Chat on WhatsApp"
                      className="w-full bg-stone border border-neutral-border py-2.5 px-3.5 text-xs text-charcoal outline-none focus:border-charcoal"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Button Link</label>
                    <input
                      type="text"
                      required
                      value={editingBanner.button_link}
                      onChange={e => setEditingBanner({ 
                        ...editingBanner, 
                        button_link: e.target.value,
                        is_external: e.target.value.startsWith('http')
                      })}
                      placeholder="e.g. /?category=Necklaces or https://wa.me/..."
                      className="w-full bg-stone border border-neutral-border py-2.5 px-3.5 text-xs text-charcoal outline-none focus:border-charcoal"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase font-bold tracking-widest text-gray-400">Insert After Product #</label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={editingBanner.insert_after_index}
                      onChange={e => setEditingBanner({ ...editingBanner, insert_after_index: Number(e.target.value) || 8 })}
                      className="w-full bg-stone border border-neutral-border py-2.5 px-3.5 text-xs text-charcoal outline-none focus:border-charcoal"
                    />
                    <span className="text-[8px] text-gray-400">e.g. 8 inserts it after the 8th product in the grid.</span>
                  </div>

                  <div className="space-y-2 flex flex-col justify-end">
                    <label className="flex items-center space-x-3 cursor-pointer py-3">
                      <input
                        type="checkbox"
                        checked={editingBanner.active}
                        onChange={e => setEditingBanner({ ...editingBanner, active: e.target.checked })}
                        className="w-4 h-4 accent-gold"
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-charcoal">Banner Active & Visible</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-6 border-t border-neutral-border">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-3 text-[10px] uppercase font-bold tracking-widest text-gray-400 hover:text-charcoal transition-luxury"
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    disabled={saving}
                    variant="primary"
                    className="!bg-obsidian !text-gold hover:!bg-black !px-8 !py-3 !text-[10px] tracking-widest"
                  >
                    {saving ? 'Saving...' : 'Save Banner'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AdminBannersPage

