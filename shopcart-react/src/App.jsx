import { Route, Routes } from "react-router-dom";
import Layout, { AdminLayout } from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Shop from "./pages/Shop.jsx";
import Product from "./pages/Product.jsx";
import Checkout from "./pages/Checkout.jsx";
import Login from "./pages/Login.jsx";
import Profile from "./pages/Profile.jsx";
import Admin from "./pages/Admin.jsx";

function NotFound() {
  return (
    <div className="container" style={{ padding: "80px 0", textAlign: "center" }}>
      <h1>Page not found</h1>
      <p className="notice">That page doesn't exist.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="product/:id" element={<Product />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route element={<AdminLayout />}>
        <Route path="admin" element={<Admin />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}
