import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-chocolate/theme.css';
// Fonts are bundled with the site instead of the theme's Google Fonts import,
// so the page makes no third-party requests.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/albert-sans';
import '@fontsource-variable/jetbrains-mono';
import './site.css';
import {Theme} from '@astryxdesign/core/theme';
import {chocolateTheme} from '@astryxdesign/theme-chocolate/built';
import {App} from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={chocolateTheme} mode="dark">
      <App />
    </Theme>
  </StrictMode>,
);
