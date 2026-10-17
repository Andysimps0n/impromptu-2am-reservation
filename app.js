import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './src/App.jsx';

createRoot(document.querySelector('#root')).render(createElement(App));
