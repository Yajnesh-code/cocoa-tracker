import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Farmers from './pages/Farmers';
import Batches from './pages/Batches';
import Breaking from './pages/Breaking';
import Fermentation from './pages/Fermentation';
import Transfers from './pages/Transfers';
import Drying from './pages/Drying';
import Moisture from './pages/Moisture';
import Packing from './pages/Packing';
import Trace from './pages/Trace';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/trace/:batch_id" element={<Trace />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="farmers" element={<Farmers />} />
            <Route path="batches" element={<Batches />} />
            <Route path="breaking" element={<Breaking />} />
            <Route path="fermentation" element={<Fermentation />} />
            <Route path="transfers" element={<Transfers />} />
            <Route path="drying" element={<Drying />} />
            <Route path="moisture" element={<Moisture />} />
            <Route path="packing" element={<Packing />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
