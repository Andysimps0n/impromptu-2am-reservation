import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicApp } from './src/public/PublicApp.jsx';
import { mountAdminApp } from './src/admin/AdminApp.jsx';

const bookingView = document.querySelector('#booking-view');
const adminView = document.querySelector('#admin-view');

window.showBookingView = () => {
  bookingView.classList.remove('hidden');
  adminView.classList.add('hidden');
};

document.querySelector('#staff-link').addEventListener('click', () => {
  bookingView.classList.add('hidden');
  adminView.classList.remove('hidden');
});

createRoot(bookingView).render(createElement(PublicApp));
mountAdminApp(adminView);
