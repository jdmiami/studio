'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Building, Users, Boxes } from 'lucide-react';
import Link from 'next/link';

const onboardingSteps = [
  {
    icon: Building,
    title: 'Add Your First Provider',
    description: "Providers are the sources of your inventory, like farms or suppliers. Let's add one to get started.",
    buttonText: 'Go to Providers',
    href: '/providers',
    step: 1,
  },
  {
    icon: Boxes,
    title: 'Add Your First Product',
    description: "Next, let's add the products you sell, like 'Green Coconuts' or 'Coconut Oil'.",
    buttonText: 'Go to Inventory',
    href: '/inventory',
    step: 2,
  },
  {
    icon: Users,
    title: 'Add Your First Client',
    description: 'Clients are the businesses or people you sell to. Who is your first customer?',
    buttonText: 'Go to Clients',
    href: '/clients',
    step: 3,
  },
];

/**
 * A guide component for new users to set up their business.
 * Displays a series of steps to add providers, products, and clients.
 *
 * @returns The OnboardingGuide component.
 */
export function OnboardingGuide() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-card p-12 text-center shadow-lg">
        <div className="mb-8">
            <h1 className="font-headline text-4xl font-bold text-primary">Welcome to CocoSales AI!</h1>
            <p className="mt-2 text-lg text-muted-foreground">Let's get your business set up in a few simple steps.</p>
        </div>
        <div className="grid w-full max-w-4xl gap-8 md:grid-cols-2 lg:grid-cols-3">
            {onboardingSteps.map((step, index) => (
            <div key={step.step} className="relative flex">
                <Card className="flex flex-1 flex-col justify-between text-left transition-all hover:scale-105 hover:shadow-primary/20">
                <CardHeader>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <step.icon className="h-6 w-6" />
                    </div>
                    <CardTitle>{step.title}</CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Link href={step.href}>
                    <Button className="w-full">
                        {step.buttonText}
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    </Link>
                </CardContent>
                </Card>
                {index < onboardingSteps.length - 1 && (
                     <ArrowRight className="absolute left-full top-1/2 -translate-y-1/2 text-muted-foreground/50 mx-4 hidden lg:block" />
                )}
            </div>
            ))}
      </div>
       <div className="mt-8">
          <Link href="/">
              <Button variant="ghost">I'll do this later</Button>
          </Link>
        </div>
    </div>
  );
}
