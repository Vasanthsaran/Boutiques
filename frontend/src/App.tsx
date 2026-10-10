import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { PublicLayout } from './components/layout/PublicLayout';
import { AdminLayout, CustomerLayout, RequireAdmin, RequireCustomer } from './components/layout/AppLayouts';
import { PageLoader } from './components/ui';
import HomePage from './pages/public/Home';

// Route-level code splitting keeps the public bundle small.
const lazyNamed = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })));

const pub = () => import('./pages/public/Catalog');
const work = () => import('./pages/public/Work');
const info = () => import('./pages/public/Info');
const auth = () => import('./pages/public/Auth');
const cust = () => import('./pages/customer/Customer');
const adm = {
  dash: () => import('./pages/admin/Dashboard'),
  work: () => import('./pages/admin/Work'),
  cat: () => import('./pages/admin/Catalog'),
  appt: () => import('./pages/admin/Appointments'),
  people: () => import('./pages/admin/People'),
  content: () => import('./pages/admin/Content'),
};

const ServicesPage = lazyNamed(pub, 'ServicesPage');
const ServiceDetailPage = lazyNamed(pub, 'ServiceDetailPage');
const CollectionsPage = lazyNamed(pub, 'CollectionsPage');
const CollectionDetailPage = lazyNamed(pub, 'CollectionDetailPage');
const RecentWorkPage = lazyNamed(work, 'RecentWorkPage');
const WorkDetailPage = lazyNamed(work, 'WorkDetailPage');
const AboutPage = lazyNamed(info, 'AboutPage');
const ContactPage = lazyNamed(info, 'ContactPage');
const AppointmentsPage = lazyNamed(info, 'AppointmentsPage');
const NotFoundPage = lazyNamed(info, 'NotFoundPage');
const LoginPage = lazyNamed(auth, 'LoginPage');
const RegisterPage = lazyNamed(auth, 'RegisterPage');
const ForgotPasswordPage = lazyNamed(auth, 'ForgotPasswordPage');
const ResetPasswordPage = lazyNamed(auth, 'ResetPasswordPage');
const VerifyEmailPage = lazyNamed(auth, 'VerifyEmailPage');
const AdminLoginPage = lazyNamed(auth, 'AdminLoginPage');
const CustomerDashboard = lazyNamed(cust, 'CustomerDashboard');
const CustomerProfile = lazyNamed(cust, 'CustomerProfile');
const CustomerAppointments = lazyNamed(cust, 'CustomerAppointments');
const CustomerEnquiries = lazyNamed(cust, 'CustomerEnquiries');
const CustomerFavorites = lazyNamed(cust, 'CustomerFavorites');
const CustomerNotifications = lazyNamed(cust, 'CustomerNotifications');
const AdminDashboard = lazyNamed(adm.dash, 'AdminDashboard');
const AdminActivity = lazyNamed(adm.dash, 'AdminActivity');
const AdminWorkList = lazyNamed(adm.work, 'AdminWorkList');
const AdminWorkEditor = lazyNamed(adm.work, 'AdminWorkEditor');
const AdminGallery = lazyNamed(adm.work, 'AdminGallery');
const AdminServices = lazyNamed(adm.cat, 'AdminServices');
const AdminCollections = lazyNamed(adm.cat, 'AdminCollections');
const AdminCategories = lazyNamed(adm.cat, 'AdminCategories');
const AdminAppointments = lazyNamed(adm.appt, 'AdminAppointments');
const AdminEnquiries = lazyNamed(adm.people, 'AdminEnquiries');
const AdminCustomers = lazyNamed(adm.people, 'AdminCustomers');
const AdminHomepage = lazyNamed(adm.content, 'AdminHomepage');
const AdminSettings = lazyNamed(adm.content, 'AdminSettings');

const S = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;
const withS = (el: React.ReactNode) => <S>{el}</S>;

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/services', element: withS(<ServicesPage />) },
      { path: '/services/:slug', element: withS(<ServiceDetailPage />) },
      { path: '/collections', element: withS(<CollectionsPage />) },
      { path: '/collections/:slug', element: withS(<CollectionDetailPage />) },
      { path: '/recent-work', element: withS(<RecentWorkPage />) },
      { path: '/recent-work/:slug', element: withS(<WorkDetailPage />) },
      { path: '/about', element: withS(<AboutPage />) },
      { path: '/contact', element: withS(<ContactPage />) },
      { path: '/appointments', element: withS(<AppointmentsPage />) },
      { path: '/login', element: withS(<LoginPage />) },
      { path: '/register', element: withS(<RegisterPage />) },
      { path: '/forgot-password', element: withS(<ForgotPasswordPage />) },
      { path: '/reset-password', element: withS(<ResetPasswordPage />) },
      { path: '/verify-email', element: withS(<VerifyEmailPage />) },
      {
        path: '/customer',
        element: (
          <RequireCustomer>
            <CustomerLayout />
          </RequireCustomer>
        ),
        children: [
          { index: true, element: <Navigate to="/customer/dashboard" replace /> },
          { path: 'dashboard', element: withS(<CustomerDashboard />) },
          { path: 'profile', element: withS(<CustomerProfile />) },
          { path: 'appointments', element: withS(<CustomerAppointments />) },
          { path: 'enquiries', element: withS(<CustomerEnquiries />) },
          { path: 'favorites', element: withS(<CustomerFavorites />) },
          { path: 'notifications', element: withS(<CustomerNotifications />) },
        ],
      },
      { path: '*', element: withS(<NotFoundPage />) },
    ],
  },
  { path: '/admin/login', element: withS(<AdminLoginPage />) },
  {
    path: '/admin',
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'dashboard', element: withS(<AdminDashboard />) },
      { path: 'recent-work', element: withS(<AdminWorkList />) },
      { path: 'recent-work/new', element: withS(<AdminWorkEditor />) },
      { path: 'recent-work/:id', element: withS(<AdminWorkEditor />) },
      { path: 'gallery', element: withS(<AdminGallery />) },
      { path: 'services', element: withS(<AdminServices />) },
      { path: 'collections', element: withS(<AdminCollections />) },
      { path: 'categories', element: withS(<AdminCategories />) },
      { path: 'appointments', element: withS(<AdminAppointments />) },
      { path: 'enquiries', element: withS(<AdminEnquiries />) },
      { path: 'customers', element: withS(<AdminCustomers />) },
      { path: 'homepage', element: withS(<AdminHomepage />) },
      { path: 'activity', element: withS(<AdminActivity />) },
      { path: 'settings', element: withS(<AdminSettings />) },
      { path: '*', element: <Outlet /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
