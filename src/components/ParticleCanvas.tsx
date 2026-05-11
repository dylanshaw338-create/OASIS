import { useEffect, useRef } from 'react'

interface AmbientBackgroundProps {
  opacity?: number
}

// 采用流体体积光 (Volumetric Ambient Fluid) 代替星星
export default function ParticleCanvas({ opacity = 0.8 }: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // 创建极少量的巨型流体光球
    const orbs = Array.from({ length: 6 }, (_, i) => {
      // Teal & Orange 电影感配色调整 -> 淡冰蓝与浅琥珀
      const isAmber = i % 2 === 0
      const color = isAmber ? '217, 119, 6' : '125, 211, 252' // Amber vs Light Ice Blue (Tailwind sky-300)
      const baseOpacity = isAmber ? 0.08 : 0.06

      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 400 + 400, // 400px - 800px 超大半径
        color,
        baseOpacity,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.005 + 0.002
      }
    })

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      orbs.forEach((orb) => {
        // 缓慢漂移
        orb.x += orb.vx
        orb.y += orb.vy
        
        // 边界平滑反弹
        if (orb.x < -orb.r || orb.x > canvas.width + orb.r) orb.vx *= -1
        if (orb.y < -orb.r || orb.y > canvas.height + orb.r) orb.vy *= -1

        // 缓慢呼吸
        orb.phase += orb.speed
        const currentOpacity = orb.baseOpacity + Math.sin(orb.phase) * 0.02

        // 绘制巨型径向渐变，模拟体积光
        const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r)
        gradient.addColorStop(0, `rgba(${orb.color}, ${currentOpacity})`)
        gradient.addColorStop(1, `rgba(${orb.color}, 0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2)
        ctx.fill()
      })

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity, filter: 'blur(40px)' }} // 整体极致高斯模糊
    />
  )
}
