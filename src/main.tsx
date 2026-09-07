import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// 注意：LangProvider 内部使用了 useLocation/useNavigate，必须放在 BrowserRouter 内。
// 正确位置在 App.tsx 中（包住 <Routes>），这里不要重复包裹。
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
