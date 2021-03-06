/* @flow */

import { $ } from '../vendor';
import { Module } from '../core/module';
import { ajax, i18n } from '../environment';
import * as Modules from '../core/modules';
import {
	click,
	downcast,
	formatDate,
	formatDateDiff,
	formatNumber,
	getUserInfo,
	loggedInUser,
	string,
	Thing,
} from '../utils';
import * as CommentNavigator from './commentNavigator';
import * as Hover from './hover';
import * as QuickMessage from './quickMessage';
import * as UserHighlight from './userHighlight';
import * as UserTagger from './userTagger';

export const module: Module<*> = new Module('userInfo');

module.moduleName = 'userInfoName';
module.category = 'usersCategory';
module.description = 'userInfoDesc';
module.options = {
	hoverInfo: {
		title: 'userInfoHoverInfoTitle',
		type: 'boolean',
		value: true,
		description: 'userInfoHoverInfoDesc',
	},
	useQuickMessage: {
		title: 'userInfoUseQuickMessageTitle',
		type: 'boolean',
		value: true,
		description: 'userInfoUseQuickMessageDesc',
		dependsOn: options => options.hoverInfo.value,
	},
	hoverDelay: {
		title: 'userInfoHoverDelayTitle',
		type: 'text',
		value: '800',
		description: 'userInfoHoverDelayDesc',
		advanced: true,
		dependsOn: options => options.hoverInfo.value,
	},
	fadeDelay: {
		title: 'userInfoFadeDelayTitle',
		type: 'text',
		value: '200',
		description: 'userInfoFadeDelayDesc',
		advanced: true,
		dependsOn: options => options.hoverInfo.value,
	},
	fadeSpeed: {
		title: 'userInfoFadeSpeedTitle',
		type: 'text',
		value: '0.7',
		description: 'userInfoFadeSpeedDesc',
		advanced: true,
		dependsOn: options => options.hoverInfo.value,
	},
	gildComments: {
		title: 'userInfoGildCommentsTitle',
		type: 'boolean',
		value: true,
		description: 'userInfoGildCommentsDesc',
		advanced: true,
		dependsOn: options => options.hoverInfo.value,
	},
	highlightButton: {
		title: 'userInfoHighlightButtonTitle',
		type: 'boolean',
		value: true,
		description: 'userInfoHighlightButtonDesc',
		advanced: true,
		dependsOn: options => options.hoverInfo.value,
	},
	highlightColor: {
		title: 'userInfoHighlightColorTitle',
		type: 'color',
		value: '#5544CC',
		description: 'userInfoHighlightColorDesc',
		advanced: true,
		dependsOn: options => options.highlightButton.value,
	},
	highlightColorHover: {
		title: 'userInfoHighlightColorHoverTitle',
		type: 'color',
		value: '#6677AA',
		description: 'userInfoHighlightColorHoverDesc',
		advanced: true,
		dependsOn: options => options.highlightButton.value,
	},
};

export const highlightedUsers = {};

module.go = () => {
	if (module.options.hoverInfo.value) {
		$(document.body).on('mouseover', UserTagger.usernameSelector, handleMouseOver);
	}
};

function handleMouseOver(e: Event) {
	const authorLink = downcast(e.target, HTMLAnchorElement);
	if (!UserTagger.usernameRE.test(authorLink.href)) return;
	const [, username] = UserTagger.usernameRE.exec(authorLink.href);
	if (!username) console.error(i18n('userInfoInvalidUsernameLink'));
	const thing = Thing.from(authorLink);

	Hover.infocard(module.moduleID)
		.target(e.target)
		.options({
			width: 475,
			openDelay: module.options.hoverDelay.value,
			fadeDelay: module.options.fadeDelay.value,
			fadeSpeed: module.options.fadeSpeed.value,
		})
		.populateWith(card => showUserInfo(card, username, thing))
		.begin();
}

async function showUserInfo(card, username, thing) {
	card.populate([username]);

	let data;

	try {
		({ data } = await getUserInfo(username));
	} catch (e) {
		return [null, i18n('userInfoUserNotFound')];
	}

	if (data.is_suspended) {
		return [null, i18n('userInfoUserSuspended')];
	}

	const d = new Date(data.created_utc * 1000);

	const $header = $(string.html`
		<div>
			<a href="/user/${data.name}">/u/${data.name}</a>
		 	(<a href="/user/${data.name}/submitted/">${i18n('userInfoLinks')}</a>)
		 	(<a href="/user/${data.name}/comments/">${i18n('userInfoComments')}</a>)
		</div>
	`);

	if (loggedInUser()) {
		// Add friend button to header.
		const $friendButton = $(`
			<span class="fancy-toggle-button toggle" style="display: inline-block; margin-left: 12px;">
				<a class="option active ${data.is_friend ? 'remove' : 'add'}" href="#" tabindex="100">${i18n('userInfoAddRemoveFriends', data.is_friend ? '-' : '+')}</a>
			</span>
		`);

		$friendButton.click(async e => {
			if (e.target.tagName !== 'A') return;
			e.preventDefault();
			const $link = $(e.target);
			const isRemove = $link.hasClass('remove');
			await ajax({
				method: 'POST',
				url: `/api/${isRemove ? 'unfriend' : 'friend'}`,
				data: {
					type: 'friend',
					name: data.name,
					container: `t2_${(await getUserInfo()).data.id}`,
				},
			});
			$link
				.toggleClass('remove', !isRemove)
				.toggleClass('add', isRemove)
				.text(`${isRemove ? '+' : '-'} friends`);
			// The cache is now outdated, so expire it.
			ajax.invalidate({ url: `/user/${data.name}/about.json` });
		});

		$header.append($friendButton);
	}

	card.populate([$header]);

	let userHTML = string.escape`
		<div class="authorFieldPair"><div class="authorLabel">${i18n('userInfoRedditorSince')}</div> <div class="authorDetail">${formatDate(d)} (${formatDateDiff(d)})</div></div>
		<div class="authorFieldPair"><div class="authorLabel">${i18n('userInfoPostKarma')}</div> <div class="authorDetail">${formatNumber(data.link_karma)}</div></div>
		<div class="authorFieldPair"><div class="authorLabel">${i18n('userInfoCommentKarma')}</div> <div class="authorDetail">${formatNumber(data.comment_karma)}</div></div>
	`;

	const nameLowercase = (data.name || '').toLowerCase();

	const userTaggerEnabled = Modules.isRunning(UserTagger);
	const userTag = userTaggerEnabled && await UserTagger.tagStorage.get(nameLowercase);

	if (userTaggerEnabled) {
		userHTML += `<div class="authorFieldPair"><div class="authorLabel">${i18n('userInfoUserTag')}</div> <div class="authorDetail" style="display:flex"><a href="/u/${data.name}"/></div></div>`;
	}
	if (userTag && userTag.link) {
		const links = userTag.link.split(/\s/).reduce((acc, url) => acc + string.escape`<a target="_blank" rel="noopener noreferer" href="${url}">${url.replace(/^https?:\/\/(www\.)?/, '')}</a>`, '');
		userHTML += `<div class="authorFieldPair"><div class="authorLabel">${i18n('userInfoLink')}</div> <div class="authorDetail">${links}</div></div>`;
	}

	userHTML += string.escape`
		<div class="clear"></div>
		<div class="bottomButtons">
			<a target="_blank" rel="noopener noreferer" class="blueButton composeButton" href="/message/compose/?to=${data.name}"><img src="https://redditstatic.s3.amazonaws.com/mailgray.png"> ${i18n('userInfoSendMessage')}</a>
	`;

	if (data.is_gold) {
		userHTML += string.escape`<a target="_blank" rel="noopener noreferer" class="blueButton" href="/gold/about">${i18n('userInfoUserHasRedditGold')}</a>`;
	} else {
		userHTML += string.escape`<a target="_blank" rel="noopener noreferer" id="gildUser" class="blueButton" href="/gold?goldtype=gift&recipient=${data.name}">${i18n('userInfoGiftRedditGold')}</a>`;
	}

	if (module.options.highlightButton.value) {
		const isHighlight = !highlightedUsers[data.id];
		userHTML += string.escape`<div class="${isHighlight ? 'blueButton' : 'redButton'}" id="highlightUser" data-userid="${data.id}">${isHighlight ? i18n('userInfoHighlight') : i18n('userInfoUnhighlight')}</div>`;
	}

	const isUnignore = userTag && userTag.ignore;
	userHTML += string.escape`<div class="${isUnignore ? 'redButton' : 'blueButton'}" id="ignoreUser" user="${nameLowercase}">&empty; ${isUnignore ? i18n('userInfoUnignore') : i18n('userInfoIgnore')}</div>`;

	userHTML += '<div class="clear"></div></div>'; // closes bottomButtons div

	const body = $('<div id="authorInfoToolTip" />').append(userHTML);

	if (userTaggerEnabled) {
		const ignoreButton = body.find('#ignoreUser');
		ignoreButton.on('click', ignoreUser);
		const tagAnchorPoint = downcast(body[0].querySelector('a[href*="/u/"]'), HTMLAnchorElement);
		UserTagger.applyTagToAuthor(tagAnchorPoint, false, true);
	}
	if (module.options.highlightButton.value) {
		body.find('#highlightUser').on('click', ({ target }: Event) => {
			const userid = target.getAttribute('data-userid');
			toggleUserHighlight(target, userid);
		});
	}
	if (module.options.gildComments.value && thing && thing.isComment()) {
		body.find('#gildUser').on('click', (e: MouseEvent) => {
			if (!thing || e.ctrlKey || e.cmdKey || e.shiftKey) return;

			hideAuthorInfo();
			const giveGold = thing.entry.querySelector('.give-gold');
			click(giveGold);
			e.preventDefault();
		});
	}

	if (module.options.useQuickMessage.value && Modules.isRunning(QuickMessage)) {
		body.find('a.composeButton').on('click', (e: JQueryMouseEventObject) => {
			if (e.which === 1) {
				e.preventDefault();

				let entryUrl;
				if (QuickMessage.module.options.linkToCurrentPage.value && thing) {
					const permalink = thing.getCommentPermalink();
					if (permalink) {
						entryUrl = permalink.href;
						if (!entryUrl.includes('?context=')) entryUrl += '?context=10';
					}
				}

				QuickMessage.openQuickMessageDialog({
					to: data.name,
					body: entryUrl,
				});
				hideAuthorInfo();
			}
		});
	}

	return [null, body];
}

function hideAuthorInfo() {
	Hover.infocard(module.moduleID).close();
}

function toggleUserHighlight(authorInfoToolTipHighlight, userid) {
	if (highlightedUsers[userid]) {
		highlightedUsers[userid].remove();
		delete highlightedUsers[userid];
		toggleUserHighlightButton(authorInfoToolTipHighlight, true);
		if (Modules.isRunning(CommentNavigator) && CommentNavigator.module.options.openOnHighlightUser.value) {
			CommentNavigator.getPostsByCategory(); // refresh informations
		}
	} else {
		highlightedUsers[userid] = UserHighlight.highlightUser(userid);
		toggleUserHighlightButton(authorInfoToolTipHighlight, false);
		if (Modules.isRunning(CommentNavigator) && CommentNavigator.module.options.openOnHighlightUser.value) {
			CommentNavigator.showNavigator('highlighted');
		}
	}
}

function toggleUserHighlightButton(authorInfoToolTipHighlight, canHighlight) {
	$(authorInfoToolTipHighlight)
		.toggleClass('blueButton', canHighlight)
		.toggleClass('redButton', !canHighlight)
		.text(canHighlight ? i18n('userInfoHighlight') : i18n('userInfoUnhighlight'));
}

function ignoreUser(e: Event) {
	let thisIgnore;
	if (e.target.classList.contains('blueButton')) {
		e.target.classList.remove('blueButton');
		e.target.classList.add('redButton');
		$(e.target).html(string.escape`&empty; ${i18n('userInfoUnignore')}`);
		thisIgnore = true;
	} else {
		e.target.classList.remove('redButton');
		e.target.classList.add('blueButton');
		$(e.target).html(string.escape`&empty; ${i18n('userInfoIgnore')}`);
		thisIgnore = false;
	}
	const thisName = e.target.getAttribute('user');
	UserTagger.ignoreUser(thisName, thisIgnore);
}
