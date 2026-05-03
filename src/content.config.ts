import { glob, file } from 'astro/loaders';
import { defineCollection } from 'astro/content/config';
import { z } from 'astro/zod'

const projects = defineCollection({
    loader: glob({ pattern: "src/content/projects/**/*.md" }),
    schema: z.object({
        id: z.number(),
        title: z.string().max(80),
        tools: z.preprocess(
            (val) => (Array.isArray(val) ? val : [val]),
            z.array(z.string())
        ),
        year: z.string().max(4),
        liveSite: z.url().optional(),
        github: z.url().optional(),
        description: z.string().max(500),
        isFeatured: z.boolean(),
        isDraft: z.boolean()
    })
});

const blog = defineCollection({
    loader: glob({ pattern: "src/content/blog/**/*.md" }),
    schema: z.object({
        id: z.number(),
        slug: z.string().max(80),
        title: z.string().max(120),
        publishedDate: z.date(),
        category: z.enum(["systems", "homelab", "chemistry", "ai", "productivity", "projects"]),
        tags: z.array(z.string()).optional(),
        description: z.string().max(300).optional(),
        readingTime: z.number().optional(),
        isDraft: z.boolean()
    })
})

const experience = defineCollection({
    loader: file("src/content/resume/experience.yaml"),
    schema: z.object({
        title: z.string().max(120),
        timeline: z.string().max(20),
        description: z.string().max(700)
    })
})

const education = defineCollection({
    loader: file("src/content/resume/education.yaml"),
    schema: z.object({
        title: z.string().max(120),
        timeline: z.string().max(20),
        school: z.string().max(120)
    })
})

const skillsAndTools = defineCollection({
    loader: file("src/content/skills-and-tools/skillsAndTools.yaml"),
    schema: z.object({
        title: z.string().max(70),
        items: z.array(z.string())
    })
})


export const collections = { projects, blog, experience, education, skillsAndTools };
