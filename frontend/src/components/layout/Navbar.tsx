import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { cn } from '../../lib/cn';
import { buttonClasses } from '../ui/button';
import { ChartIcon, ClockIcon, LogoutIcon, MenuIcon, XIcon } from '../ui/icons';
import Logo from './Logo';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: ChartIcon, alsoActiveOn: null },
  // Match reports are opened from History, so keep that tab highlighted there.
  { to: '/history', label: 'History', icon: ClockIcon, alsoActiveOn: '/match/' },
] as const;

function Avatar({ email }: { email: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-xs font-semibold uppercase text-white"
    >
      {email.charAt(0)}
    </span>
  );
}

export default function Navbar() {
  const { isLoggedIn, user, logout } = useAuth();
  const toast = useToast();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActiveLink = (isActive: boolean, alsoActiveOn: string | null) =>
    isActive || (alsoActiveOn !== null && pathname.startsWith(alsoActiveOn));

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = () => {
    closeMenu();
    logout();
    toast.info('You have been logged out.');
  };

  // Mobile drawer: close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const desktopLinkClass = (isActive: boolean) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
      isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
    );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <nav
          aria-label="Main"
          className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8"
        >
          <div className="flex items-center gap-8">
            <Logo />
            {isLoggedIn && (
              <div className="hidden items-center gap-1 md:flex">
                {NAV_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) => desktopLinkClass(isActiveLink(isActive, link.alsoActiveOn))}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Desktop right side */}
          <div className="hidden items-center gap-3 md:flex">
            {isLoggedIn && user ? (
              <>
                <div className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3">
                  <Avatar email={user.email} />
                  <span className="max-w-[180px] truncate text-sm text-gray-600">{user.email}</span>
                </div>
                <button type="button" onClick={handleLogout} className={buttonClasses('ghost', 'sm')}>
                  <LogoutIcon className="h-4 w-4" />
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className={buttonClasses('ghost', 'sm')}>
                  Login
                </Link>
                <Link to="/register" className={buttonClasses('primary', 'sm')}>
                  Sign Up
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="-mr-2 rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 md:hidden"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
        </nav>
      </header>

      {/* Mobile slide-in drawer — a sibling of <header>, not a child: the header's
          backdrop-filter would otherwise become the containing block for this
          position:fixed element and clip it to the 64px bar. */}
      <div
        className={cn(
          'fixed inset-0 z-50 overflow-hidden transition-[visibility] duration-300 md:hidden',
          menuOpen ? 'visible' : 'invisible',
        )}
        aria-hidden={!menuOpen}
      >
        <div
          onClick={closeMenu}
          className={cn(
            'absolute inset-0 bg-gray-900/25 backdrop-blur-[2px] transition-opacity duration-300',
            menuOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            'absolute inset-y-0 right-0 flex w-full max-w-xs flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
            menuOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
            <Logo onClick={closeMenu} />
            <button
              type="button"
              onClick={closeMenu}
              aria-label="Close menu"
              className="-mr-2 rounded-lg p-2 text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <XIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-1 p-4">
            {isLoggedIn && user ? (
              <>
                <div className="mb-3 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  <Avatar email={user.email} />
                  <span className="truncate text-sm font-medium text-gray-700">{user.email}</span>
                </div>
                {NAV_LINKS.map(({ to, label, icon: Icon, alsoActiveOn }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={closeMenu}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors',
                        isActiveLink(isActive, alsoActiveOn)
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50',
                      )
                    }
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </NavLink>
                ))}
                <div className="mt-auto border-t border-gray-100 pt-4">
                  <button type="button" onClick={handleLogout} className={buttonClasses('secondary', 'md', 'w-full')}>
                    <LogoutIcon className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <Link to="/register" onClick={closeMenu} className={buttonClasses('primary', 'lg', 'w-full')}>
                  Sign Up
                </Link>
                <Link to="/login" onClick={closeMenu} className={buttonClasses('secondary', 'lg', 'w-full')}>
                  Login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
