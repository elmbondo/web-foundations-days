# Reflection

## The most difficult concept

For me the hardest idea in the course was asynchronous code, especially fetch with async and await. I kept expecting fetch to throw an error when the server replied with a 404 or a 500, but it does not. It only throws when the network itself fails, so I have to check response.ok myself. I overcame this by breaking my own code on purpose in the Project 2 API client. I changed the URL to a wrong one, switched the Network tab to offline, and watched which messages appeared. Seeing both error paths happen made the try, catch and finally pattern finally make sense, and I stopped forgetting the response.ok check.

## What I would improve

The feedback on my Day 7 scaling plan was that the file was cut off before the upload flow and the trade-offs. The ideas were fine, but the finished file on GitHub was incomplete, and it happened twice. The part I would improve is how I check my work. After every push I would open the file on GitHub, scroll to the last line, and run git diff before I commit. In my architecture document I would also add more detail about what happens when a component fails, because that is where a design is really tested.

## What I will learn next

Next I want to build a real backend with Node.js and Express, using my api-design.md as the plan. After that I will connect it to a PostgreSQL database with the tables from my data model, and then learn React so I can build bigger interfaces from reusable components.