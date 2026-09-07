import { useNavigate } from 'react-router-dom';
import Parallax from '../components/Parallax';
import { useConfigs, useLang } from '../i18n';
import { siteRuntimeConfig } from '../site-config.generated';

export default function Footer() {
  const { footerConfig, pageLabels } = useConfigs();
  const { withLang } = useLang();
  const navigate = useNavigate();
  if (!footerConfig.heading && footerConfig.columns.length === 0) {
    return null;
  }

  return (
    <footer
      id="footer"
      style={{
        padding: '150px 5vw 60px',
        background: '#060D1A',
        position: 'relative',
        zIndex: 2,
        borderTop: '1px solid rgba(0, 180, 216, 0.1)',
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Parallax speed={0.15}>
        <div className="flex items-center" style={{ gap: 32, marginBottom: 80 }}>
          <img
            src="/images/logo.png"
            alt={pageLabels.nav.logoAlt}
            style={{ width: 'clamp(64px, 7vw, 110px)', height: 'auto', flexShrink: 0 }}
          />
          {footerConfig.heading && (
            <h2
              style={{
                fontFamily: "'EB Garamond', serif",
                fontWeight: 400,
                fontSize: 'clamp(40px, 5vw, 80px)',
                lineHeight: 1.1,
                letterSpacing: '-1.44px',
                color: '#ffffff',
                margin: 0,
              }}
            >
              {footerConfig.heading}
            </h2>
          )}
        </div>
        </Parallax>

        {footerConfig.columns.length > 0 && (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
            style={{ gap: 60, marginBottom: 120 }}
          >
            {footerConfig.columns.map((column, colIndex) => (
              <div key={colIndex} className="flex flex-col" style={{ gap: 16 }}>
                {column.title && (
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 12,
                      fontWeight: 300,
                      letterSpacing: '3px',
                      textTransform: 'uppercase',
                      color: '#A8B8CC',
                      opacity: 0.4,
                      marginBottom: 8,
                    }}
                  >
                    {column.title}
                  </span>
                )}
                {column.links.map((link) => {
                  const label = typeof link === 'string' ? link : link.label;
                  const href = typeof link === 'string' ? '#' : link.href;
                  const isRoute = href.startsWith('/');
                  const isExternal = href.startsWith('http');
                  return (
                    <a
                      key={label}
                      href={href}
                      className="nav-link"
                      style={{ width: 'fit-content' }}
                      onClick={isRoute ? (e) => { e.preventDefault(); navigate(withLang(href)); window.scrollTo(0, 0); } : undefined}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noreferrer' : undefined}
                    >
                      {label}
                    </a>
                  );
                })}
                {column.qrs && column.qrs.length > 0 && (
                  <div className="flex flex-col" style={{ marginTop: 4, maxWidth: 320 }}>
                    {column.qrs.map((qr) => {
                      const row = (
                        <>
                          <img
                            src={qr.img}
                            alt={`${qr.label} ${qr.handle}`}
                            loading="lazy"
                            style={{ width: 72, height: 72, display: 'block', flexShrink: 0 }}
                          />
                          <div className="flex flex-col" style={{ gap: 4 }}>
                            <span
                              style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: 10,
                                fontWeight: 300,
                                letterSpacing: '2px',
                                textTransform: 'uppercase',
                                color: '#A8B8CC',
                              }}
                            >
                              {qr.label}
                            </span>
                            <span
                              style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: 13,
                                fontWeight: 400,
                                color: '#FFFFFF',
                              }}
                            >
                              {qr.handle}
                            </span>
                          </div>
                        </>
                      );
                      const rowStyle: React.CSSProperties = {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '10px 0',
                        borderTop: '1px solid rgba(0, 180, 216, 0.1)',
                        width: '100%',
                        textAlign: 'left',
                      };
                      return qr.href ? (
                        <a
                          key={qr.img}
                          href={qr.href}
                          target="_blank"
                          rel="noreferrer"
                          className="group transition-opacity duration-300 hover:opacity-80"
                          style={rowStyle}
                        >
                          {row}
                        </a>
                      ) : (
                        <div key={qr.img} style={rowStyle}>
                          {row}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div
          className="flex flex-col md:flex-row items-start md:items-center justify-between"
          style={{
            paddingTop: 24,
            borderTop: '1px solid rgba(0, 180, 216, 0.06)',
            gap: 16,
          }}
        >
          {/* 左：版权 + 备案（堆叠） */}
          <div className="flex flex-col" style={{ gap: 6 }}>
          {footerConfig.copyright && (
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 200,
                fontSize: 12,
                color: '#A8B8CC',
                opacity: 0.4,
              }}
            >
              {siteRuntimeConfig.copyright.replace('{year}', String(new Date().getFullYear()))}
            </span>
          )}

          {/* ICP / 公安备案：config.yml 配置，留空不显示 */}
          {(siteRuntimeConfig.icp.number || siteRuntimeConfig.icp.policeNumber) && (
            <div
              className="flex flex-wrap items-center"
              style={{ gap: 16, marginTop: 4 }}
            >
              {siteRuntimeConfig.icp.number && (
                <a
                  href={siteRuntimeConfig.icp.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontFamily: "'Inter', 'PingFang SC', sans-serif",
                    fontWeight: 200,
                    fontSize: 12,
                    color: '#A8B8CC',
                    opacity: 0.4,
                    textDecoration: 'none',
                    transition: 'opacity 0.3s',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.8'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.4'; }}
                >
                  {siteRuntimeConfig.icp.number}
                </a>
              )}
              {siteRuntimeConfig.icp.policeNumber && (
                <a
                  href={siteRuntimeConfig.icp.policeUrl || siteRuntimeConfig.icp.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontFamily: "'Inter', 'PingFang SC', sans-serif",
                    fontWeight: 200,
                    fontSize: 12,
                    color: '#A8B8CC',
                    opacity: 0.4,
                    textDecoration: 'none',
                    transition: 'opacity 0.3s',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.8'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.4'; }}
                >
                  {siteRuntimeConfig.icp.policeNumber}
                </a>
              )}
            </div>
          )}
          </div>
          {footerConfig.bottomLinks.length > 0 && (
            <div className="flex items-center" style={{ gap: 24 }}>
              {footerConfig.bottomLinks.map((bottomLink) => (
                <a
                  key={bottomLink.label}
                  href={bottomLink.href || '#'}
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 200,
                    fontSize: 12,
                    color: '#A8B8CC',
                    opacity: 0.4,
                    textDecoration: 'none',
                    transition: 'opacity 0.3s',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.8'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.4'; }}
                >
                  {bottomLink.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
