import React, { useEffect, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { 
  SidebarInset, 
  SidebarProvider, 
  SidebarTrigger 
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { 
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useCompanySettings, getCompanyNameSync, companySettingsEmitter } from "@/hooks/useCompanySettings";
import { ScrollArea } from "@/components/ui/ScrollArea";
import ChatWidget from "./chat/ChatWidget";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbs?: Array<{
    label: string;
    href?: string;
  }>;
}

export function Layout({ children, title, breadcrumbs }: LayoutProps) {
  const { getCompanyLogo } = useCompanySettings();
  const logo = getCompanyLogo();
  // Utilise le cache mémoire pour le nom dès le premier render
  const [companyName, setCompanyName] = useState(getCompanyNameSync());
  useEffect(() => {
    const unsubscribe = companySettingsEmitter.subscribe(() => {
      setCompanyName(getCompanyNameSync());
    });
    return unsubscribe;
  }, []);
  // Découpe le nom pour l'affichage
  const dashIndex = companyName.indexOf(' - ');
  const primaryName = dashIndex === -1 ? companyName : companyName.substring(0, dashIndex).trim();
  const secondaryName = dashIndex === -1 ? '' : companyName.substring(dashIndex + 3).trim();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            {breadcrumbs && (
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((breadcrumb, index) => (
                    <React.Fragment key={index}>
                      <BreadcrumbItem className="hidden md:block">
                        {breadcrumb.href ? (
                          <BreadcrumbLink href={breadcrumb.href}>
                            {breadcrumb.label}
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                      {index < breadcrumbs.length - 1 && (
                        <BreadcrumbSeparator className="hidden md:block" />
                      )}
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            )}
            {title && !breadcrumbs && (
              <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            )}
            <div className="flex-1" />
            <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
              <img 
                src={logo}
                alt="Company Logo" 
                className="h-6 w-6 object-contain opacity-70"
                onError={(e) => e.currentTarget.style.display = 'none'}
              />
              <span className="font-medium">
                <span className="text-primary">{primaryName}</span>
                {secondaryName && <span className="text-muted-foreground"> &nbsp;| {secondaryName}</span>}
              </span>
            </div>
          </div>
        </header>
        <ScrollArea variant="content" orientation="vertical" className="flex-1">
          <div className="flex flex-1 flex-col gap-2 p-2 pt-3">
            {children}
          </div>
        </ScrollArea>
      </SidebarInset>
      <ChatWidget />
    </SidebarProvider>
  );
} 