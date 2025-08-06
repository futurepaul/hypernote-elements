import React, { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { Button } from "./ui/button";
import { User, LogOut, Key } from "lucide-react";

export function UserProfile() {
  const { 
    isAuthenticated, 
    pubkey, 
    hasExtension, 
    isConnecting,
    error,
    login, 
    logout,
    clearError,
    checkExtension
  } = useAuthStore();
  
  // Check for extension on mount and periodically
  useEffect(() => {
    // Initial check
    checkExtension();
    
    // Check again after a short delay (extension might load after page)
    const timeout = setTimeout(() => {
      checkExtension();
    }, 1000);
    
    // Check periodically in case extension is installed while page is open
    const interval = setInterval(() => {
      if (!hasExtension) {
        checkExtension();
      }
    }, 5000);
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);
  
  // Format pubkey for display (show first 8 and last 4 characters)
  const formatPubkey = (key: string) => {
    if (!key) return "";
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  };
  
  // Convert hex pubkey to npub format for display
  const getNpub = (hexPubkey: string) => {
    // For now, just show the formatted hex
    // Later we can use snstr's nip19 encoding
    return formatPubkey(hexPubkey);
  };
  
  if (!hasExtension) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-muted-foreground">
          Install a Nostr extension to connect
        </div>
      </div>
    );
  }
  
  if (isConnecting) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-muted-foreground">
          Connecting...
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-destructive">
          {error}
        </div>
        <Button 
          size="sm" 
          variant="outline"
          onClick={clearError}
        >
          Dismiss
        </Button>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return (
      <Button 
        size="sm" 
        onClick={login}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Key className="h-4 w-4 mr-2" />
        Connect NIP-07
      </Button>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-mono">
          {getNpub(pubkey || "")}
        </span>
      </div>
      <Button 
        size="sm" 
        variant="ghost"
        onClick={logout}
        className="h-8 w-8 p-0"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}