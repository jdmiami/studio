'use client';

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useUser, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function SettingsPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    
    const [companyName, setCompanyName] = useState("CocoSales AI");
    const [logoUrl, setLogoUrl] = useState("");

    const handleSaveChanges = async () => {
        if (!user) {
            toast({
                variant: 'destructive',
                title: "Not Authenticated",
                description: "You must be logged in to save settings.",
            });
            return;
        }

        try {
            const userDocRef = doc(firestore, 'users', user.uid);
            await updateDoc(userDocRef, {
                'settings.company_name': companyName,
                'settings.logo_url': logoUrl,
            });
            toast({
                title: "Settings Saved",
                description: "Your company settings have been updated.",
            });
        } catch (error) {
            console.error("Error updating settings: ", error);
            toast({
                variant: 'destructive',
                title: "Error",
                description: "Failed to save settings.",
            });
        }
    }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center">
        <h1 className="font-headline text-3xl font-semibold">Settings</h1>
      </div>

      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Company Profile</CardTitle>
          <CardDescription>
            Update your company's profile information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input id="logo-url" placeholder="https://example.com/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </div>
        </CardContent>
        <CardFooter>
            <Button onClick={handleSaveChanges}>Save Changes</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
