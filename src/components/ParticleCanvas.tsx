import { useEffect, useRef } from 'react'

interface ParticleCanvasProps {
  opacity?: number
  particleCount?: number
}

interface ShootingStar {
  x: number
  y: number
  length: number
  speed: number
  angle: number
  opacity: number
  active: boolean
}

export default function ParticleCanvas({ opacity = 0.8, particleCount = 150 }: ParticleCanvasProps) {
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

    // 初始化星星：加入极微弱的定向漂移速度 (模拟航行感)
    const DRIFT_SPEED_X = -0.015 // 统一向左上
    const DRIFT_SPEED_Y = -0.01

    const particles = Array.from({ length: particleCount }, () => {
      const typeRand = Math.random()
      let r, g, b
      if (typeRand > 0.95) { r = 255; g = 255; b = 255 } 
      else if (typeRand > 0.6) { r = 139; g = 92; b = 246 } 
      else { r = 59; g = 130; b = 246 } 

      // 引入轻微的速度差异，让星空有深度错觉
      const depthFactor = Math.random() * 0.5 + 0.5

      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: DRIFT_SPEED_X * depthFactor,
        vy: DRIFT_SPEED_Y * depthFactor,
        r: Math.random() * 1.5 + 0.5,
        baseOpacity: Math.random() * 0.3 + 0.05,
        blinkPhase: Math.random() * Math.PI * 2,
        blinkSpeed: Math.random() * 0.005 + 0.002,
        color: `${r}, ${g}, ${b}`
      }
    })

    // 初始化流星系统
    const shootingStars: ShootingStar[] = []
    
    const createShootingStar = () => {
      // 随机决定是否生成流星 (低频，大概每几秒一颗)
      if (Math.random() > 0.002) return

      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.2 // 大致 45 度角 (左上到右下，或右下到左上)
      const speed = Math.random() * 4 + 2
      const length = Math.random() * 80 + 40
      
      // 大部分从上方或右侧划过
      let startX, startY
      if (Math.random() > 0.5) {
        startX = Math.random() * canvas.width
        startY = -length
      } else {
        startX = canvas.width + length
        startY = Math.random() * canvas.height
      }

      shootingStars.push({
        x: startX,
        y: startY,
        length,
        speed,
        angle,
        opacity: Math.random() * 0.5 + 0.3,
        active: true
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 1. 绘制静谧呼吸星空
      particles.forEach((p) => {
        // 微弱漂移
        p.x += p.vx
        p.y += p.vy
        
        // 边界循环 (平滑)
        if (p.x < -10) p.x = canvas.width + 10
        if (p.y < -10) p.y = canvas.height + 10

        p.blinkPhase += p.blinkSpeed
        const currentOpacity = p.baseOpacity + Math.sin(p.blinkPhase) * 0.2
        const finalOpacity = Math.max(0.02, Math.min(0.6, currentOpacity))

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color}, ${finalOpacity})`
        
        if (finalOpacity > 0.2) {
          ctx.shadowBlur = p.r * 4
          ctx.shadowColor = `rgba(${p.color}, ${finalOpacity})`
        } else {
          ctx.shadowBlur = 0
        }
        
        ctx.fill()
        ctx.shadowBlur = 0 
      })

      // 2. 尝试生成流星
      createShootingStar()

      // 3. 绘制并更新流星
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const star = shootingStars[i]
        if (!star.active) {
          shootingStars.splice(i, 1)
          continue
        }

        // 绘制流星头部 (亮核)
        ctx.beginPath()
        ctx.arc(star.x, star.y, 1.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`
        ctx.shadowBlur = 10
        ctx.shadowColor = `rgba(147, 197, 253, ${star.opacity})`
        ctx.fill()
        ctx.shadowBlur = 0

        // 绘制流星尾迹 (渐变线)
        const tailX = star.x - Math.cos(star.angle) * star.length
        const tailY = star.y - Math.sin(star.angle) * star.length
        
        const gradient = ctx.createLinearGradient(star.x, star.y, tailX, tailY)
        gradient.addColorStop(0, `rgba(147, 197, 253, ${star.opacity})`)
        gradient.addColorStop(1, 'rgba(147, 197, 253, 0)')

        ctx.beginPath()
        ctx.moveTo(star.x, star.y)
        ctx.lineTo(tailX, tailY)
        ctx.strokeStyle = gradient
        ctx.lineWidth = 1
        ctx.stroke()

        // 更新位置
        star.x -= Math.cos(star.angle) * star.speed
        star.y += Math.sin(star.angle) * star.speed

        // 越界销毁
        if (star.x < -star.length || star.y > canvas.height + star.length) {
          star.active = false
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animRef.current)
    }
  }, [particleCount])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity }}
    />
  )
}
