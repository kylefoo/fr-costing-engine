import Image from "next/image"
import backgroundImage from "@/public/background.jpg"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="min-h-screen lg:flex text-lg">
      <div className="lg:w-1/2 relative z-10 flex flex-col justify-center px-10 lg:px-20 py-20 lg:py-0 text-left">
        <h2 className="text-4xl mb-3 font-bold tracking-tight text-foreground">
          Fastroll AI Tools{" "}
          <span className="block text-primary text-2xl font-normal mt-1">
            Work in progress
          </span>
        </h2>

        <p className="text-muted-foreground mb-6">
          Size checker, Color analyzer, Cost calculator, and more.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button asChild variant="secondary">
            <a href="/color-analyzer">
              Color Analyzer (Coming soon)
            </a>
          </Button>
          <Button asChild>
            <a href="/size-checker">Size Checker</a>
          </Button>
        </div>
      </div>

      <div className="lg:w-1/2 relative">
        <svg
          className="hidden lg:block text-background fill-current absolute h-full transform -translate-x-1/2 w-48 z-10"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon points="50,0 100,0 50,100 0,100"></polygon>
        </svg>

        <Image
          src={backgroundImage}
          alt="Ocean Image"
          placeholder="blur"
          className="lg:absolute object-cover lg:inset-y-0 lg:right-0 lg:h-full lg:w-full"
        />
      </div>
    </div>
  )
}
