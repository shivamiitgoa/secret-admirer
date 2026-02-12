import { motion, useReducedMotion } from 'framer-motion'

type LoadingScreenProps = {
  title: string
  message: string
}

function LoadingScreen({ title, message }: LoadingScreenProps) {
  const reduceMotion = useReducedMotion()

  return (
    <main className="loading-screen">
      <motion.section
        className="loading-panel surface-panel"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: 8 }}
        animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
      >
        <h1 className="loading-title">{title}</h1>
        <p className="loading-copy">{message}</p>
        <div className="dot-flux" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </motion.section>
    </main>
  )
}

export default LoadingScreen
