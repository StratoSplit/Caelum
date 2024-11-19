import React from 'react';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Imports
import AudioConfiguration from './components/AudioConfiguration';
import Login from './components/Login';
import Register from './components/Register';
import Logout from './components/Logout';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route exact path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/" element={<PrivateRoute><AudioConfiguration /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
