import { motion, AnimatePresence } from 'framer-motion'
import React from 'react'

import { WhatsappIcon } from 'hugeicons-react'


const WhatsAppConcierge = () => {
  // Replace with the business's actual WhatsApp number
  const WHATSAPP_NUMBER = '2348126839505' 
  const MESSAGE = encodeURIComponent("Hello Lustrax, I'm interested in a piece from your collection.")
  const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${MESSAGE}`

  return (
    <motion.a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.9, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-6 right-6 z-[100] flex items-center space-x-3 bg-obsidian text-gold px-4 py-3 border border-gold/30 shadow-2xl group transition-luxury"
      title="Chat with us on WhatsApp"
    >
       <WhatsappIcon size={20} className="text-gold transition-luxury group-hover:scale-110" />
       <div className="hidden sm:flex flex-col text-left">
          <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-white group-hover:text-gold transition-luxury">
            Chat with Us
          </span>
          <span className="text-[8px] uppercase tracking-widest text-gold-muted font-normal">
            WhatsApp Support
          </span>
       </div>
    </motion.a>
  )
}

export default WhatsAppConcierge




