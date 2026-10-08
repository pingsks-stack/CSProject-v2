import fs from 'node:fs'
import path from 'node:path'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { config } from './config.js'
import { loadUser } from './lib/auth.js'
import { errorHandler } from './lib/http.js'
import { adminRouter } from './routes/admin.js'
import { authRouter } from './routes/auth.js'
import { chatRouter, notificationsRouter } from './routes/chat.js'
import { contentRouter, projectContentRouter } from './routes/content.js'
import { dashboardRouter, statsRouter } from './routes/dashboard.js'
import { githubWebhook, projectGithubRouter } from './routes/github.js'
import { metaRouter } from './routes/meta.js'
import { projectsRouter } from './routes/projects.js'
import { publicRouter } from './routes/public.js'
import { requestsRouter } from './routes/requests.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          // รูปใน README ของ GitHub และรูปโปรไฟล์ผู้ commit
          'img-src': ["'self'", 'data:', 'https:'],
          'upgrade-insecure-requests': config.secureCookies ? [] : null,
        },
      },
    }),
  )
  // webhook ของ GitHub ต้องได้ body ดิบไว้ตรวจลายเซ็น จึงอยู่ก่อน express.json
  app.post('/api/github/webhook', express.raw({ type: '*/*', limit: '5mb' }), githubWebhook)
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  const api = express.Router()
  api.use(loadUser)
  api.use('/auth', authRouter)
  api.use('/public', publicRouter)
  api.use('/projects/:id/github', projectGithubRouter)
  api.use('/projects/:id', projectContentRouter)
  api.use('/projects', projectsRouter)
  api.use('/requests', requestsRouter)
  api.use('/chat', chatRouter)
  api.use('/notifications', notificationsRouter)
  api.use('/dashboard', dashboardRouter)
  api.use('/stats', statsRouter)
  api.use('/admin', adminRouter)
  api.use('/', contentRouter)
  api.use('/', metaRouter)
  api.use((_req, res) => {
    res.status(404).json({ error: 'ไม่พบ API นี้' })
  })
  app.use('/api', api)

  // เซิร์ฟเวอร์จริง: เสิร์ฟหน้าเว็บ React ที่ build แล้ว (client/dist) จากพอร์ตเดียวกัน
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }))
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'))
    })
  }

  app.use(errorHandler)
  return app
}
