'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProfilePage() {
  const auth = useAuth();
  const user = auth?.user;
  const isLoading = auth?.isLoading || false;
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [avatarError, setAvatarError] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionWorkspace, setNotionWorkspace] = useState<string | null>(null);
  const [isConnectingNotion, setIsConnectingNotion] = useState(false);


  // Check for Notion OAuth callback parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const notionSuccess = urlParams.get('notion_success');
    const notionError = urlParams.get('notion_error');

    if (notionSuccess === 'true') {
      toast({
        title: t('profile.notionConnected'),
        description: t('profile.notionConnectedDescription'),
        duration: 5000,
      });
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      // Refresh Notion connection status
      checkNotionConnection();
    } else if (notionError) {
      toast({
        title: t('profile.notionConnectionFailed'),
        description: t('profile.notionConnectionFailedDescription'),
        variant: 'destructive',
        duration: 5000,
      });
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [t]);

  // Check Notion connection status
  const checkNotionConnection = async () => {
    if (!user) return;
    
    try {
      const response = await fetch('/api/notion/status', {
        headers: {
          'Authorization': `Bearer ${auth?.session?.access_token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotionConnected(data.connected);
        setNotionWorkspace(data.workspaceName);
      }
    } catch (error) {
      console.error('Failed to check Notion connection:', error);
    }
  };

  // Connect to Notion
  const handleConnectNotion = async () => {
    if (!user) return;
    
    setIsConnectingNotion(true);
    try {
      const response = await fetch('/api/notion/oauth/authorize', {
        headers: {
          'Authorization': `Bearer ${auth?.session?.access_token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        window.open(data.authUrl, '_blank');
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch (error) {
      console.error('Failed to connect Notion:', error);
      toast({
        title: t('profile.notionConnectionFailed'),
        description: t('profile.notionConnectionFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setIsConnectingNotion(false);
    }
  };

  // Disconnect from Notion
  const handleDisconnectNotion = async () => {
    if (!user) return;
    
    try {
      const response = await fetch('/api/notion/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth?.session?.access_token}`
        }
      });
      
      if (response.ok) {
        setNotionConnected(false);
        setNotionWorkspace(null);
        toast({
          title: t('profile.notionDisconnected'),
          description: t('profile.notionDisconnectedDescription'),
          duration: 3000,
        });
      } else {
        throw new Error('Failed to disconnect Notion');
      }
    } catch (error) {
      console.error('Failed to disconnect Notion:', error);
      toast({
        title: t('profile.notionDisconnectFailed'),
        description: t('profile.notionDisconnectFailedDescription'),
        variant: 'destructive',
      });
    }
  };

  // Check connection status on component mount
  useEffect(() => {
    if (user) {
      checkNotionConnection();
    }
  }, [user]);


  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">{t('common.loading')}</h2>
          <p className="text-muted-foreground">{t('common.pleaseWait')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container flex flex-col mx-auto py-2 px-4 sm:px-6">
      <div className="space-y-8">
        {/* 用户信息部分 */}
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-primary">{t('profile.title')}</h2>
          </div>
          
          <div className="rounded-lg shadow-sm border p-6">
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="relative">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center space-x-6 pb-12 sm:pb-0">
                    <div className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-primary/10">
                      <img
                        src={avatarError ? '/default-avatar.png' : (user.user_metadata?.avatar_url || '/default-avatar.png')}
                        alt="Profile"
                        className="h-full w-full object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold">{user.user_metadata?.name || 'User'}</h2>
                      <p className="text-muted-foreground">{user.user_metadata?.display_name || user.email}</p>
                    </div>
                  </div>
                  {/* Sign out button removed */}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Integrations Section */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>{t('profile.integrations')}</CardTitle>
              <CardDescription>
                {t('profile.integrationsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Notion Integration Sub-card */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img 
                        src="/notion.png" 
                        alt="Notion" 
                        className="h-6 w-6"
                      />
                      <div>
                        <p className="font-medium">{'Notion'}</p>
                        {notionConnected ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <p className="text-sm text-green-700">{t('profile.notionConnected')}</p>
                            {notionWorkspace && (
                              <p className="text-xs text-muted-foreground">
                                {t('profile.workspace')}: {notionWorkspace}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t('profile.notionIntegrationDescription')}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={notionConnected ? handleDisconnectNotion : handleConnectNotion}
                      disabled={isConnectingNotion}
                      variant={notionConnected ? "destructive" : "default"}
                      size="sm"
                    >
                      {isConnectingNotion ? (
                        t('common.loading')
                      ) : notionConnected ? (
                        t('profile.disconnectNotion')
                      ) : (
                        t('profile.connectNotion')
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}