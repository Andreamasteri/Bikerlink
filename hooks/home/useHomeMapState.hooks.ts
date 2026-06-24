import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

export function useHomeAds() {
  const [adIndex, setAdIndex] = (require("react").useState)(0);
  const { data: myAds = [] } = useQuery<any[]>({
    queryKey: ["/api/ads/my-ads"],
  });

  const handleAdClick = useCallback(async (ad: any) => {
    try { await apiRequest("POST", `/api/ads/${ad.id}/click`); } catch { }
    if (ad.linkUrl) {
      let url = ad.linkUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      try { (require("react-native").Linking).openURL(url); } catch { }
    }
  }, []);

  return { adIndex, setAdIndex, myAds, handleAdClick };
}

export function useHomeSearch(userId: string | undefined) {
  const [searchText, setSearchText] = (require("react").useState)("");
  const [searchResults, setSearchResults] = (require("react").useState)([]);
  const [searchLoading, setSearchLoading] = (require("react").useState)(false);
  const [showSearchResults, setShowSearchResults] = (require("react").useState)(false);

  const handleSearch = useCallback(async (text: string) => {
    setSearchText(text);
    if (text.trim().length < 2) { setSearchResults([]); setShowSearchResults(false); return; }
    setSearchLoading(true);
    setShowSearchResults(true);
    try {
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(text.trim())}`);
      const data = await res.json();
      setSearchResults((data as any[]).filter((u) => u.id !== userId));
    } catch { }
    setSearchLoading(false);
  }, [userId]);

  return { searchText, setSearchText, searchResults, setSearchResults, searchLoading, showSearchResults, setShowSearchResults, handleSearch };
}
