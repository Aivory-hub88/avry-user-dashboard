"use client"

import { FaWhatsapp } from "react-icons/fa"

/** The WhatsApp logo (lucide has no brand icons). Inherits the text colour unless `brand` is set. */
export default function WhatsappIcon({ size = 14, brand = false, className = "" }: { size?: number; brand?: boolean; className?: string }) {
  return <FaWhatsapp size={size} aria-hidden className={`${brand ? "text-[#25D366]" : ""} ${className}`.trim()} />
}
