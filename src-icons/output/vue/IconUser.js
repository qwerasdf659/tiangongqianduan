import { defineComponent, h } from 'vue';

export const IconUser = defineComponent({
  name: 'IconUser',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M192 896c0-176 144-320 320-320s320 144 320 320", "fillRule": "evenodd"})
      ]
    );
  }
});
