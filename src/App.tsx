import { Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './sections/Navigation';
import Hero from './sections/Hero';
import Curriculum from './sections/Curriculum';
import CinematicVision from './sections/CinematicVision';
import AlumniArchives from './sections/AlumniArchives';
import Footer from './sections/Footer';
import CapabilityDetail from './sections/CapabilityDetail';
import JimsqlPage from './sections/JimsqlPage';
import JimlangPage from './sections/JimlangPage';
import JimclawPage from './sections/JimclawPage';
import JimmymedPage from './sections/JimmymedPage';
import PiAgentHudPage from './sections/PiAgentHudPage';
import DshHudPage from './sections/DshHudPage';
import CoursesPage from './sections/CoursesPage';
import MediaPage from './sections/MediaPage';
import { PageMeta } from './shareMeta';
import { LangProvider } from './i18n';

function HomePage() {
  return (
    <div
      style={{
        background: '#060D1A',
        minHeight: '100vh',
        overflowX: 'hidden',
      }}
    >
      <Navigation />

      <main>
        <Hero />
        <Curriculum />
        <CinematicVision />
        <AlumniArchives />
        <Footer />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <PageMeta />
      <LangProvider>
      <Routes>
      {/* 直接访问 /index.html（或 /en/index.html）时重定向到规范 URL，避免黑页 */}
      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="/en/index.html" element={<Navigate to="/en" replace />} />
      {/* 中文路由 */}
      <Route path="/" element={<HomePage />} />
      <Route path="/capability/:slug" element={<CapabilityDetail />} />
      <Route path="/jimsql" element={<JimsqlPage />} />
      <Route path="/jimlang" element={<JimlangPage />} />
      <Route path="/jimclaw" element={<JimclawPage />} />
      <Route path="/jimmymed" element={<JimmymedPage />} />
      <Route path="/pi-agent-hud" element={<PiAgentHudPage />} />
      <Route path="/dsh-hud" element={<DshHudPage />} />
      <Route path="/courses" element={<CoursesPage />} />
      <Route path="/media" element={<MediaPage />} />
      {/* 英文路由：同一组页面，LangProvider 内部会根据 /en 前缀锁定英文 */}
      <Route path="/en" element={<HomePage />} />
      <Route path="/en/capability/:slug" element={<CapabilityDetail />} />
      <Route path="/en/jimsql" element={<JimsqlPage />} />
      <Route path="/en/jimlang" element={<JimlangPage />} />
      <Route path="/en/jimclaw" element={<JimclawPage />} />
      <Route path="/en/jimmymed" element={<JimmymedPage />} />
      <Route path="/en/pi-agent-hud" element={<PiAgentHudPage />} />
      <Route path="/en/dsh-hud" element={<DshHudPage />} />
      <Route path="/en/courses" element={<CoursesPage />} />
      <Route path="/en/media" element={<MediaPage />} />
      </Routes>
      </LangProvider>
    </>
  );
}
