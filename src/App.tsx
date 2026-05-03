import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireRole } from "@/components/RequireRole";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import MasterAdmin from "./pages/MasterAdmin";
import ManagerDashboard from "./pages/ManagerDashboard";
import RestaurantPublic from "./pages/RestaurantPublic";
import OrderTracking from "./pages/OrderTracking";
import OrderTicket from "./pages/OrderTicket";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin" element={<RequireRole role="master_admin"><MasterAdmin /></RequireRole>} />
            <Route path="/dashboard" element={<RequireRole role="manager"><ManagerDashboard /></RequireRole>} />
            <Route path="/r/:slug" element={<RestaurantPublic />} />
            <Route path="/pedido/:token" element={<OrderTracking />} />
            <Route path="/ticket/:orderId" element={<RequireRole role="manager"><OrderTicket /></RequireRole>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
