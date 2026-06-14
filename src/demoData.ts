import { ResumeStructure } from "./types";

export const DEMO_RESUMES: Record<string, { label: string; data: ResumeStructure }> = {
  software_grad: {
    label: "Software Engineer Graduate",
    data: {
      fullName: "Alex Rivera",
      email: "alex.rivera@edu.com",
      phone: "+1 (555) 432-8765",
      linkedin: "linkedin.com/in/alex-rivera-dev",
      website: "alexrivera.dev",
      summary: "Passionate Computer Science graduate with hands-on experience in modern web technologies including React, Node.js, and SQL. Enthusiastic about writing clean, maintainable code, implementing responsive visual interfaces, and resolving complex algorithmic problems through team collaboration.",
      workExperience: [
        {
          id: "w-1",
          role: "Web Developer Intern",
          company: "Nexus Digital Agency",
          duration: "May 2025 - August 2025",
          description: [
            "Assisted in developing client-facing web applications using React, resulting in a 15% increase in page loading speeds.",
            "Wrote clean component test suites using Jest, boosting code coverage from 60% to 80% over 3 months.",
            "Participated in daily standups and sprint planning sessions, contributing to the deployment of 4 responsive product websites."
          ]
        },
        {
          id: "w-2",
          role: "Academic Capstone Lead Developer",
          company: "State University",
          duration: "September 2024 - April 2025",
          description: [
            "Coordinated a team of 4 junior developers to build an open-source campus food delivery locator using Express.js and MySQL.",
            "Designed and implemented RESTful API routes handling 500+ daily mock requests with sub-50ms latency.",
            "Integrated third-party geolocation maps to display real-time food stalls."
          ]
        }
      ],
      education: [
        {
          id: "e-1",
          degree: "B.S. in Computer Science",
          school: "State University",
          duration: "2021 - 2025",
          gpa: "3.75 / 4.00"
        }
      ],
      skills: ["React", "TypeScript", "Node.js", "Express", "REST APIs", "MySQL", "Git", "Tailwind CSS", "Jest", "Agile Methodologies"]
    }
  },
  marketing_grad: {
    label: "Digital Marketing Graduate",
    data: {
      fullName: "Sophia Vance",
      email: "sophia.vance@marketing.com",
      phone: "+1 (555) 890-5432",
      linkedin: "linkedin.com/in/sophia-vance-growth",
      summary: "Creative and analytical Marketing graduate seeking an Associate role. Skilled in social media community building, search engine optimization (SEO), content strategy, and standard analytic suites. Proven track record of boosting engagement through user-centric copy.",
      workExperience: [
        {
          id: "w-1",
          role: "Digital Marketing Assistant",
          company: "Pulse Media Group",
          duration: "June 2025 - September 2025",
          description: [
            "Co-authored social media content calendars that drove a 22% quarter-over-quarter follower increase across Instagram.",
            "Analyzed Google Analytics metrics to report monthly conversion anomalies, assisting the growth manager with budget adjustments.",
            "Authored 12 optimized SEO blog entries reaching a top-10 ranking for target seasonal keywords."
          ]
        }
      ],
      education: [
        {
          id: "e-1",
          degree: "B.A. in Communications & Marketing",
          school: "Metro Polytechnic",
          duration: "2022 - 2026",
          gpa: "3.60 / 4.00"
        }
      ],
      skills: ["SEO Optimization", "Google Analytics", "Content Strategy", "Copywriting", "Instagram ads", "Canva", "Email Campaigns", "Social Media Management"]
    }
  }
};

export const DEMO_JDS: Record<string, { title: string; company: string; text: string }> = {
  frontend_eng: {
    title: "Junior Frontend Engineer",
    company: "Vercel Systems",
    text: `About Us:
We are Vercel Systems, building high-speed visual editing platforms. We search for an enthusiastic Junior Frontend Engineer to join our expanding team.

Responsibilities:
- Build highly reusable React components and visual dashboard charts.
- Craft accessible, pixel-perfect user interfaces using Tailwind CSS and TypeScript.
- Improve state optimization for extreme application responsiveness.
- Write robust unit tests to bulletproof client software.
- Research modern rendering architectures and suggest optimization approaches.

Requirements:
- Strong familiarity with React, TypeScript, and modern state managers.
- Excellent grip on styling concepts and responsiveness.
- Solid understanding of Git operations and software collaboration.
- Great communication, problem-solving mindset, and eagerness to learn.`
  },
  growth_marketer: {
    title: "Junior Outreach & Content Specialist",
    company: "ScribeAI Inc.",
    text: `Role Summary:
ScribeAI is a fast-paced AI workspace creator. We are looking for a Junior Outreach & Content Specialist to scale our inbound lead generation.

Key Tasks:
- Plan, schedule, and organize weekly marketing campaigns.
- Formulate SEO copywriting pieces focusing on technology keywords.
- Track social media engagement statistics and provide data-led optimizations.
- Pitch brand stories to online newsletters and industry blogs.
- Design appealing quick visuals using Canva or equivalent.

We Want to See:
- Familiarity with SEO keywords, content writing, and metric tracking.
- Creative flair, exceptional proofreading, and strong visual communication skills.
- Self-starting graduate background in marketing, english, or media.`
  }
};
