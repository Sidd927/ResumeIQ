import { Outlet, RouterProvider, ScrollRestoration, createBrowserRouter } from 'react-router-dom';

import Layout from './components/layout/Layout';
import ProtectedRoute, { PublicOnlyRoute } from './components/ProtectedRoute';
import { ToastProvider } from './components/ui/Toast';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Landing from './pages/Landing';
import Login from './pages/Login';
import MatchDetail from './pages/MatchDetail';
import NotFound from './pages/NotFound';
import Register from './pages/Register';

/** Root route: scroll restoration (top on push, restored on back/forward). */
function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

/**
 * Route map
 *   /            Landing      public-only (logged in → /dashboard)
 *   /login       Login        public-only
 *   /register    Register     public-only
 *   /dashboard   Dashboard    protected
 *   /history     History      protected
 *   /match/:id   MatchDetail  protected
 */
const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            index: true,
            element: (
              <PublicOnlyRoute>
                <Landing />
              </PublicOnlyRoute>
            ),
          },
          {
            element: <ProtectedRoute />,
            children: [
              { path: 'dashboard', element: <Dashboard /> },
              { path: 'history', element: <History /> },
              { path: 'match/:id', element: <MatchDetail /> },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: 'login', element: <Login /> },
          { path: 'register', element: <Register /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
