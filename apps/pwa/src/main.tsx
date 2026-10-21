import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import App from './App';
import { cssVariablesResolver, theme } from './theme';
import './i18n/i18n';
import '@mantine/core/styles.css';
// 400, 600 and 700 are the weights the rendered pages actually compute — measured in a
// browser across both modes. 500 was imported on a guess and never fetched, while 600 was in
// use and missing, so Mantine's control labels fell back to the nearest face.
// Latin only — the app ships English and French, and the full import carried Greek, Cyrillic
// and Vietnamese subsets the build would have to hold and nobody would ever fetch.
import '@fontsource/roboto-condensed/latin-400.css';
import '@fontsource/roboto-condensed/latin-600.css';
import '@fontsource/roboto-condensed/latin-700.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <App />
    </MantineProvider>
  </StrictMode>,
);
