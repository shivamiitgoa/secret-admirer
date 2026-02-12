type BrandMarkProps = {
  size?: number
  className?: string
  decorative?: boolean
  alt?: string
}

function BrandMark({ size = 38, className, decorative = false, alt = 'Secret Admirer logo' }: BrandMarkProps) {
  const resolvedAlt = decorative ? '' : alt

  return (
    <img
      src="/secret-admirer-mark.svg"
      width={size}
      height={size}
      className={className}
      alt={resolvedAlt}
      aria-hidden={decorative ? true : undefined}
      draggable={false}
    />
  )
}

export default BrandMark
