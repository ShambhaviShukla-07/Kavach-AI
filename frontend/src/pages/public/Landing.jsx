import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  FiArrowRight,
  FiShield,
  FiActivity,
  FiMapPin,
  FiUsers,
  FiHeart,
  FiTruck,
  FiMonitor,
  FiCheckCircle,
  FiClock,
  FiNavigation,
  FiPhoneCall,
} from 'react-icons/fi'
import { RiShieldFlashFill } from 'react-icons/ri'
import { MdLocalHospital } from 'react-icons/md'

const fadeUp = {
  hidden: { opacity: 0, y: 25 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6 },
  },
}

const features = [
  {
    icon: <FiShield />,
    title: 'Women Safety',
    description:
      'Emergency SOS functionality with live location sharing to help users send alerts during emergency situations.',
    tag: 'Emergency Assistance',
  },
  {
    icon: <FiTruck />,
    title: 'Ambulance Management',
    description:
      'Manage ambulance information, monitor availability and support emergency response coordination.',
    tag: 'Emergency Response',
  },
  {
    icon: <FiMonitor />,
    title: 'Helmet Monitoring',
    description:
      'A dedicated dashboard to monitor connected helmet information and view available safety status details.',
    tag: 'Monitoring Dashboard',
  },
  {
    icon: <FiMapPin />,
    title: 'Location Tracking',
    description:
      'View available emergency location information on the platform to support response coordination.',
    tag: 'Location Support',
  },
  {
    icon: <MdLocalHospital />,
    title: 'Emergency Coordination',
    description:
      'Bring emergency-related information together to support coordination between users and response teams.',
    tag: 'Centralized Platform',
  },
  {
    icon: <FiActivity />,
    title: 'Dashboard & Reports',
    description:
      'Access organized emergency records, monitoring information and relevant activity through a centralized dashboard.',
    tag: 'Management',
  },
]

const workSteps = [
  {
    number: '01',
    icon: <FiUsers />,
    title: 'User Registration',
    description:
      'Users register and log in to access the KavachAI platform and its available safety modules.',
  },
  {
    number: '02',
    icon: <FiShield />,
    title: 'Choose a Safety Module',
    description:
      'Access Women Safety, Ambulance Management or Helmet Monitoring according to the requirement.',
  },
  {
    number: '03',
    icon: <FiMapPin />,
    title: 'Monitor & Coordinate',
    description:
      'Use the available location information, emergency records and monitoring dashboard to coordinate activities.',
  },
  {
    number: '04',
    icon: <FiCheckCircle />,
    title: 'Manage Emergency Information',
    description:
      'Authorized users can access relevant records and manage emergency-related activities through the platform.',
  },
]

function SectionHeading({ eyebrow, title, description }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="mx-auto mb-14 max-w-3xl text-center"
    >
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
        {eyebrow}
      </p>

      <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
        {title}
      </h2>

      <p className="mt-5 text-base leading-7 text-slate-400 sm:text-lg">
        {description}
      </p>
    </motion.div>
  )
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-5 rounded-[2rem] bg-cyan-500/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl shadow-cyan-950/40">
        <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/15 p-2.5 text-cyan-400">
              <RiShieldFlashFill size={23} />
            </div>

            <div>
              <h3 className="font-semibold text-white">KavachAI</h3>
              <p className="text-xs text-slate-500">Safety Dashboard Preview</p>
            </div>
          </div>

          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
            Dashboard
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-800/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <FiShield className="text-pink-400" size={21} />
              <span className="text-xs text-slate-500">Module 01</span>
            </div>
            <p className="font-semibold text-white">Women Safety</p>
            <p className="mt-1 text-xs text-slate-400">SOS & emergency support</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-800/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <FiTruck className="text-cyan-400" size={21} />
              <span className="text-xs text-slate-500">Module 02</span>
            </div>
            <p className="font-semibold text-white">Ambulance</p>
            <p className="mt-1 text-xs text-slate-400">Ambulance management</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-800/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <FiMonitor className="text-violet-400" size={21} />
              <span className="text-xs text-slate-500">Module 03</span>
            </div>
            <p className="font-semibold text-white">Helmet Monitoring</p>
            <p className="mt-1 text-xs text-slate-400">Monitoring dashboard</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-800/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <FiMapPin className="text-emerald-400" size={21} />
              <span className="text-xs text-slate-500">Platform</span>
            </div>
            <p className="font-semibold text-white">Location Support</p>
            <p className="mt-1 text-xs text-slate-400">Emergency location details</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-slate-800/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <FiActivity className="text-cyan-400" />
            <span className="text-sm font-semibold text-white">
              Integrated Safety Platform
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" />
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Illustrative dashboard preview
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#07111f] text-white">

      {/* NAVBAR */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#07111f]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="rounded-lg bg-cyan-500/15 p-2 text-cyan-400">
              <RiShieldFlashFill size={25} />
            </div>

            <span className="text-xl font-bold tracking-wide">
              Kavach<span className="text-cyan-400">AI</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-slate-300 transition hover:text-cyan-400">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-slate-300 transition hover:text-cyan-400">
              How It Works
            </a>
            <a href="#about" className="text-sm text-slate-300 transition hover:text-cyan-400">
              About
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden text-sm font-medium text-slate-300 transition hover:text-white sm:block"
            >
              Login
            </Link>

            <Link
              to="/register"
              className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative px-5 pb-24 pt-36 lg:px-8 lg:pb-32 lg:pt-44">
        <div className="absolute left-1/2 top-20 -z-0 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
              <FiShield />
              Integrated Safety & Emergency Response Platform
            </div>

            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
              A Smarter Approach to
              <span className="block bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Safety & Protection
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">
              KavachAI brings multiple safety and emergency management
              modules together in one platform, helping users access
              emergency support, ambulance management and monitoring
              facilities.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3.5 font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Get Started <FiArrowRight />
              </Link>

              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3.5 font-semibold text-white transition hover:border-cyan-400 hover:text-cyan-400"
              >
                Explore Platform <FiArrowRight />
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-400">
              <span className="flex items-center gap-2">
                <FiCheckCircle className="text-cyan-400" />
                Multiple Safety Modules
              </span>
              <span className="flex items-center gap-2">
                <FiCheckCircle className="text-cyan-400" />
                Centralized Dashboard
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7 }}
          >
            <DashboardPreview />
          </motion.div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="scroll-mt-24 px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Platform Features"
            title="One Platform. Multiple Safety Solutions."
            description="KavachAI integrates different safety and emergency management functionalities into a centralized platform."
          />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                transition={{ delay: index * 0.07 }}
                className="group rounded-2xl border border-white/10 bg-slate-900/60 p-7 transition duration-300 hover:-translate-y-2 hover:border-cyan-500/40 hover:bg-slate-900"
              >
                <div className="mb-5 inline-flex rounded-xl bg-cyan-500/10 p-3 text-2xl text-cyan-400 transition group-hover:bg-cyan-500/20">
                  {feature.icon}
                </div>

                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  {feature.tag}
                </p>

                <h3 className="mb-3 text-xl font-bold text-white">
                  {feature.title}
                </h3>

                <p className="text-sm leading-7 text-slate-400">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="scroll-mt-24 border-y border-white/5 bg-slate-900/40 px-5 py-24 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="How It Works"
            title="Safety Management Made Simpler"
            description="A structured workflow that connects users, safety modules and emergency management through one platform."
          />

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {workSteps.map((step, index) => (
              <motion.div
                key={step.number}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative rounded-2xl border border-white/10 bg-[#0b1727] p-6"
              >
                <div className="mb-5 flex items-center justify-between">
                  <div className="rounded-xl bg-cyan-500/10 p-3 text-xl text-cyan-400">
                    {step.icon}
                  </div>

                  <span className="text-3xl font-bold text-white/10">
                    {step.number}
                  </span>
                </div>

                <h3 className="mb-3 text-lg font-bold text-white">
                  {step.title}
                </h3>

                <p className="text-sm leading-7 text-slate-400">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="scroll-mt-24 px-5 py-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
              About KavachAI
            </p>

            <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Technology for a
              <span className="block text-cyan-400">
                Safer Tomorrow
              </span>
            </h2>

            <p className="mt-6 leading-8 text-slate-400">
              KavachAI is an integrated safety and emergency response
              platform designed to bring essential safety-related
              functionalities together in one place.
            </p>

            <p className="mt-4 leading-8 text-slate-400">
              The platform includes Women Safety emergency support,
              Ambulance Management and Helmet Monitoring. Its goal is
              to make safety-related information and emergency
              management more organized and accessible through a
              centralized digital system.
            </p>

            <Link
              to="/register"
              className="mt-8 inline-flex items-center gap-2 font-semibold text-cyan-400 transition hover:gap-3"
            >
              Explore KavachAI <FiArrowRight />
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 gap-4"
          >
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <FiHeart className="mb-4 text-3xl text-pink-400" />
              <h3 className="font-bold text-white">Women Safety</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                SOS and emergency assistance.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <FiTruck className="mb-4 text-3xl text-cyan-400" />
              <h3 className="font-bold text-white">Ambulance</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Ambulance management and coordination.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <FiMonitor className="mb-4 text-3xl text-violet-400" />
              <h3 className="font-bold text-white">Helmet Monitoring</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Helmet information through a monitoring dashboard.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <FiActivity className="mb-4 text-3xl text-emerald-400" />
              <h3 className="font-bold text-white">Centralized System</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Organized safety and emergency information.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-24 lg:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/80 via-slate-900 to-blue-950/80 px-6 py-16 text-center sm:px-12">
          <div className="absolute left-1/2 top-0 h-48 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative">
            <div className="mx-auto mb-5 inline-flex rounded-2xl bg-cyan-500/15 p-4 text-3xl text-cyan-400">
              <RiShieldFlashFill />
            </div>

            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Be Ready. Stay Protected.
            </h2>

            <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-400">
              Explore KavachAI and access its integrated safety and
              emergency management platform.
            </p>

            <Link
              to="/register"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-7 py-3.5 font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Get Started <FiArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#050d18] px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <Link to="/" className="flex items-center gap-2">
            <RiShieldFlashFill className="text-2xl text-cyan-400" />
            <span className="text-xl font-bold">
              Kavach<span className="text-cyan-400">AI</span>
            </span>
          </Link>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400">
            <a href="#features" className="transition hover:text-cyan-400">
              Features
            </a>
            <a href="#how-it-works" className="transition hover:text-cyan-400">
              How It Works
            </a>
            <a href="#about" className="transition hover:text-cyan-400">
              About
            </a>
            <Link to="/login" className="transition hover:text-cyan-400">
              Login
            </Link>
          </div>

          <p className="text-center text-xs text-slate-500">
            © {new Date().getFullYear()} KavachAI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}