export const APP_NAME = 'ventadeturnos.com';
export const DEVELOPER_NAME = 'Ing. Jorge Alberto Romero Villanueva';
export const CONTACT_EMAIL = 'jromerodev28@gmail.com';

export function contactMailtoUrl(subject = `Contacto desde ${APP_NAME}`) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
