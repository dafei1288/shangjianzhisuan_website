import { Routes, Route } from 'react-router-dom';
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
import CoursesPage from './sections/CoursesPage';

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
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/capability/:slug" element={<CapabilityDetail />} />
      <Route path="/jimsql" element={<JimsqlPage />} />
      <Route path="/jimlang" element={<JimlangPage />} />
      <Route path="/jimclaw" element={<JimclawPage />} />
      <Route path="/courses" element={<CoursesPage />} />
    </Routes>
  );
}
