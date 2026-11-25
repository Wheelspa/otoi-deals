import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Show } from "@clerk/react";
import { Toaster } from "sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Home from "@/pages/Home";
import Checkout from "@/pages/Checkout";
import Account from "@/pages/Account";
import Track from "@/pages/Track";
import Contact from "@/pages/Contact";
import Admin from "@/pages/Admin";
import HallOfFame from "@/pages/HallOfFame";
import Invoice from "@/pages/Invoice";
import { SignInPage, SignUpPage } from "@/pages/AuthPages";

const Private = ({ children }) => (
  <>
    <Show when="signed-in">{children}</Show>
    <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
  </>
);

const ScrollTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

function App() {
  return (
    <div className="grain min-h-screen bg-[#141B26] text-zinc-100 flex flex-col">
      <BrowserRouter>
        <ClerkAuthProvider>
          <ScrollTop />
          <Header />
          <main className="relative z-10 flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/track" element={<Track />} />
              <Route path="/hall-of-fame" element={<HallOfFame />} />
              <Route path="/invoice/:token" element={<Invoice />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/checkout/:id" element={<Private><Checkout /></Private>} />
              <Route path="/account" element={<Private><Account /></Private>} />
              <Route path="/admin" element={<Private><Admin /></Private>} />
              <Route path="/sign-in/*" element={<SignInPage />} />
              <Route path="/sign-up/*" element={<SignUpPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </ClerkAuthProvider>
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}

export default App;
