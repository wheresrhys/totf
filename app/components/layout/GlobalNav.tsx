import Link from 'next/link';
import { RingSearchForm } from './RingSearchForm';
export default function GlobalNav() {
	return (
		<><nav className="navbar shadow-base-300/20 shadow-sm">
			<div className="w-full md:flex md:items-center md:gap-2">
				<div className="flex items-center justify-between">
					<div className="navbar-start items-center justify-between max-md:w-full">
						<Link
							className="link text-base-content link-neutral text-xl font-bold no-underline flex items-center gap-2 text-nowrap"
							href="/"
						>
							<span className="icon-[fluent-emoji-flat--blackbird] size-8"></span>
							Top of the Flocks
						</Link>

						<div className="md:hidden">
							<button
								type="button"
								className="collapse-toggle btn btn-outline btn-secondary btn-sm btn-square"
								data-collapse="#default-navbar-collapse"
								aria-controls="default-navbar-collapse"
								aria-label="Toggle navigation"
							>
								<span className="icon-[tabler--menu-2] collapse-open:hidden size-4"></span>
								<span className="icon-[tabler--x] collapse-open:block hidden size-4"></span>
							</button>
						</div>
					</div>
				</div>
				<div
					id="default-navbar-collapse"
					className="md:navbar-end collapse hidden grow basis-full overflow-hidden transition-[height] duration-300 max-md:w-full"
				>
					<ul className="menu md:menu-horizontal gap-2 p-0 text-base max-md:mt-2">
						<li>
							<Link href="/sessions">Sessions</Link>
						</li>
						<li>
							<Link href="/species">Species</Link>
						</li>
					</ul>
				</div>
			</div>
		</nav>
		<RingSearchForm />
		</>
	);
}
