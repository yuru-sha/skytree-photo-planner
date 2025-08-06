import { Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import Layout from "./components/Layout";
import { ToastProvider } from "./contexts/ToastContext";
import "./App.css";

// Performance: Lazy load pages for code splitting
const HomePage = lazy(() => import("./pages/HomePage"));
const MapSearchPage = lazy(() => import("./pages/MapSearchPage"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const LocationDetailPage = lazy(() => import("./pages/LocationDetailPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));

// Loading fallback component
const PageLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

function App() {
  return (
    <div className="App">
      <ToastProvider>
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="map-search" element={<MapSearchPage />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="location/:locationId" element={<LocationDetailPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="/admin/login" element={<LoginPage />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </div>
  );
}

export default App;
