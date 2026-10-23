type Props = {
  symbol: string
  icon?: string
  size?: 'sm' | 'md' | 'lg'
}

const px = { sm: 18, md: 28, lg: 36 }

export function TokenIcon({ symbol, icon, size = 'md' }: Props) {
  const sizeClass = size === 'sm' ? 'tokico tokico--sm' : size === 'lg' ? 'tokico tokico--lg' : 'tokico'
  if (icon) {
    return <img className={sizeClass} src={icon} alt="" width={px[size]} height={px[size]} />
  }
  return (
    <span className={`${sizeClass} tokico--blank`} aria-hidden="true">
      {symbol ? '?' : '?'}
    </span>
  )
}
